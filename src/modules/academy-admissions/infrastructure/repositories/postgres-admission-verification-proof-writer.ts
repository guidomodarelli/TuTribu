/** Applies proof, contact ownership and audit in the caller's guarded request/operation transaction. @module postgres-admission-verification-proof-writer */
import "server-only";
import { assertUnreservedAdmissionContact } from "./assert-unreserved-admission-contact";
import { sql } from "drizzle-orm";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_PROOF_OPERATION, ADMISSION_CONTACT_BINDING_LOCK_DOMAIN, ADMISSION_PROOF_APPLICATION_OUTCOME, ADMISSION_PROOF_APPLICATION_AUDIT_EVENT, ADMISSION_PROOF_AUDIT_RULE } from "@/src/modules/academy-admissions/constants/admission-proof";
import { ADMISSION_AUDIT_RESOURCE_TYPE } from "../../constants/admission-audit";
import { createAdmissionProofAuditEvent } from "../../domain/entities/admission-audit-event";
import { createAdmissionResourceAuditEvent } from "../../domain/entities/admission-resource-audit-event";
import { PostgresAdmissionAuditRepository } from "./postgres-admission-audit-repository";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_EVIDENCE_KIND, ADMISSION_PROOF_STATUS, ADMISSION_SOURCE_KIND, ADMISSION_INVITATION_STATUS, ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { VERIFICATION_CHALLENGE_STATE } from "@/src/modules/academy-admissions/constants/verification-challenge";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import type { AdmissionVerificationProof } from "@/src/modules/academy-admissions/domain/entities/admission-verification-proof";
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import type { AdmissionVerificationProofWriter, ApplyAdmissionVerificationProofCommand, AdmissionProofApplicationResult } from "@/src/modules/academy-admissions/domain/repositories/admission-verification-proof-repository";
import { proposeAdmissionProofApplication } from "@/src/modules/academy-admissions/domain/policies/verification-challenge-policy";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

type PendingRequestRow = { id: string; version: number; status: string; contact_type: string | null; normalized_contact: string | null; binding_id: string | null; source: string; invitation_id: string | null; expires_at: string };
type ProofRow = { id: string; challenge_id: string; user_id: string; tribe_id: string; contact_type: string; normalized_contact: string; verification_epoch: number; connection_id: string; connection_version: number; security_epoch: string; status: AdmissionVerificationProof["status"]; verified_at: string; apply_before: string; applied_request_id: string | null; applied_at: string | null; invalidated_at: string | null; invalidation_reason: string | null };

/** Closed denial reasons of one proof application. */
type ProofApplicationDenialCode = Extract<AdmissionProofApplicationResult, { outcome: "denied" }>["code"];
/** @param challenge - Locked origin challenge, if found. @returns Whether it exists and is still the current verified, uninvalidated challenge. @typeParam Challenge - Locked challenge row. */
function isUsableChallenge<Challenge extends { state: string; is_current: boolean; invalidated_at: string | null }>(challenge: Challenge | undefined): challenge is Challenge {
  return challenge !== undefined && challenge.is_current && challenge.state === VERIFICATION_CHALLENGE_STATE.verified && challenge.invalidated_at === null;
}

/** @param binding - Locked contact binding, if any. @param requestBindingId - Binding already attached to the request. @param userId - Actual applicant. @returns Whether another owner holds the contact or the request is bound elsewhere. */
function bindingConflicts(binding: { id: string; owner_user_id: string } | undefined, requestBindingId: string | null, userId: string): boolean {
  return binding !== undefined && binding.owner_user_id !== userId || requestBindingId !== null && binding?.id !== requestBindingId;
}

/** @param config - Live protection. @param resource - Locked connection version. @param scopeEpoch - Epoch of the authorized scope. @returns Whether recovery locked or the deployment environment or epoch moved. */
function isProofSecurityChanged(config: { recoveryLocked: boolean; environment: string; securityEpoch: string }, resource: { environment: string; security_epoch: string }, scopeEpoch: string): boolean {
  return config.recoveryLocked || config.environment !== resource.environment || config.securityEpoch !== resource.security_epoch || config.securityEpoch !== scopeEpoch;
}

/** @param row - Locked stored proof. @param contact - Authorized destination. @returns Whether the proof verified exactly that destination. */
function isSameProofDestination(row: Pick<ProofRow, "contact_type" | "normalized_contact">, contact: AdmissionVerificationProof["contact"]): boolean {
  return row.contact_type === contact.type && row.normalized_contact === contact.value;
}

/** @param row - Locked stored proof. @param contact - Exact authorized destination. @param channel - Origin challenge channel. @returns The domain proof. */
function proofFromRow(row: ProofRow, contact: AdmissionVerificationProof["contact"], channel: AdmissionVerificationProof["channel"]): AdmissionVerificationProof {
  return { id: row.id, challengeId: row.challenge_id, userId: row.user_id, tribeId: row.tribe_id, contact, purpose: ADMISSION_VERIFICATION_PURPOSE.admission, verificationEpoch: row.verification_epoch, connectionId: row.connection_id, connectionVersion: row.connection_version, securityEpoch: row.security_epoch, channel, status: row.status, verifiedAt: new Date(row.verified_at), applyBefore: new Date(row.apply_before), appliedRequestId: row.applied_request_id, appliedAt: row.applied_at ? new Date(row.applied_at) : null, invalidatedAt: row.invalidated_at ? new Date(row.invalidated_at) : null, invalidationReason: row.invalidation_reason };
}

/** Owns proof attachment only; the caller retains the ledger claim and complete current policy/session authority. */
export class PostgresAdmissionVerificationProofWriter implements AdmissionVerificationProofWriter {
  /**
   * @param database - Existing guarded transaction, with the owning operation locked before request/proof locks.
   * @param authorize - Current tribe/policy/account/session authority; request mutation locks belong to this writer.
   * @param readSecurityConfig - Local external recovery/epoch snapshot, without RPC under locks.
   */
  constructor(private readonly database: RequestDatabase, private readonly authorize: (database: RequestDatabase, scope: VerificationChallengeScope) => Promise<boolean>, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>) {}

  /** Checks SQL actor plus the current owner scope rather than trusting input identity or a previous read. */
  private async isAuthorized(scope: VerificationChallengeScope): Promise<boolean> {
    return (await this.database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0]?.actor === scope.userId && await this.authorize(this.database, scope);
  }

  /**
   * @param command - Original application command.
   * @param request - Locked own request, if any.
   * @returns Why the proof cannot attach: a stale or terminal request, a different contact, or an unusable personal invitation; `null` when it can.
   */
  private async pendingRequestDenial(command: ApplyAdmissionVerificationProofCommand, request: PendingRequestRow | undefined): Promise<ProofApplicationDenialCode | null> {
    if (request?.status !== ADMISSION_REQUEST_STATUS.pending || request.version !== command.expectedRequestVersion) return ADMISSION_ERROR_CODE.requestConflict;
    if (request.normalized_contact !== null && (request.normalized_contact !== command.scope.contact.value || request.contact_type !== command.scope.contact.type)) return ADMISSION_ERROR_CODE.contactBindingConflict;
    if (request.source !== ADMISSION_SOURCE_KIND.personal) return null;
    const invitation = (await this.database.execute<{ contact_type: string; normalized_contact: string; status: string; authorization_revoked_at: string | null }>(sql`select contact_type,normalized_contact,status,authorization_revoked_at from public.academy_personal_invitations where id=${request.invitation_id} and tribe_id=${command.scope.tribeId} and redeemed_by_user_id=${command.scope.userId} and redeemed_request_id=${request.id} for share`)).rows[0];
    if (invitation?.status !== ADMISSION_INVITATION_STATUS.redeemed || invitation.authorization_revoked_at !== null) return ADMISSION_ERROR_CODE.invitationUnavailable;
    if (invitation.contact_type !== command.scope.contact.type || invitation.normalized_contact !== command.scope.contact.value) return ADMISSION_ERROR_CODE.contactBindingConflict;
    return null;
  }

  /** @param command - Original application command. @returns Whether its own ledger operation (the proof operation unless named) is still started. */
  private async hasStartedOperation(command: ApplyAdmissionVerificationProofCommand): Promise<boolean> {
    const operationType = command.operationType ?? ADMISSION_PROOF_OPERATION;
    const operation = (await this.database.execute(sql`select id from public.academy_admission_operations where id=${command.ledgerId} and actor_user_id=${command.scope.userId} and tribe_id=${command.scope.tribeId} and operation_type=${operationType} and idempotency_key=${command.operationId} and state=${OPERATION_STATE.started} for share`)).rows[0];
    return Boolean(operation);
  }

  /** @param command - Original application command. @param config - Protection sampled before the effects. @throws AdmissionOperationError when recovery locked, the deployment scope moved or the actor lost authority after the write, forcing rollback. */
  private async assertProtectionUnchanged(command: ApplyAdmissionVerificationProofCommand, config: MessagingSecurityConfig): Promise<void> {
    const currentConfig = await this.readSecurityConfig();
    if (currentConfig.recoveryLocked || currentConfig.environment !== config.environment || currentConfig.securityEpoch !== config.securityEpoch || !await this.isAuthorized(command.scope)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  }

  /** @param scope - Proof scope to apply. @returns Whether it is an admission proof whose actor is currently authorized. */
  private async isAuthorizedAdmissionScope(scope: ApplyAdmissionVerificationProofCommand["scope"]): Promise<boolean> {
    return scope.purpose === ADMISSION_VERIFICATION_PURPOSE.admission && await this.isAuthorized(scope);
  }

  /** @param command - Original application command. @returns The locked contact binding, if any, after the reservation is re-read, or a contact conflict. */
  private async lockContactBinding(command: ApplyAdmissionVerificationProofCommand): Promise<{ binding: { id: string; owner_user_id: string } | undefined } | { denial: typeof ADMISSION_ERROR_CODE.contactBindingConflict }> {
    await this.database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([ADMISSION_CONTACT_BINDING_LOCK_DOMAIN, command.scope.tribeId, command.scope.contact.type, command.scope.contact.value])},0))`);
    const binding: { id: string; owner_user_id: string } | undefined = (await this.database.execute<{ id: string; owner_user_id: string }>(sql`select id,owner_user_id from public.academy_admission_contact_bindings where tribe_id=${command.scope.tribeId} and contact_type=${command.scope.contact.type} and normalized_contact=${command.scope.contact.value} for update`)).rows[0];
    // Re-read the reservation after any account deletion that completed during this wait.
    try { await assertUnreservedAdmissionContact(this.database, command.scope.tribeId, command.scope.contact, this.readSecurityConfig); }
    catch (error) { if (error instanceof AdmissionOperationError && error.code === ADMISSION_ERROR_CODE.contactBindingConflict) return { denial: error.code }; throw error; }
    return { binding };
  }

  /**
   * Applies an unused fresh proof to an existing own pending request without changing its original deadline.
   * @param command - Authorized original intent, expected request version and current operation ledger identity.
   * @returns A minimal stored transition; unexpected failures must roll back the enclosing transaction.
   * @throws AdmissionOperationError on an impossible CAS or lost current context after an effective write.
   */
  async applyToPending(command: ApplyAdmissionVerificationProofCommand): Promise<AdmissionProofApplicationResult> {
    const denied = (code: ProofApplicationDenialCode): AdmissionProofApplicationResult => ({ outcome: ADMISSION_PROOF_APPLICATION_OUTCOME.denied, code });
    if (!await this.isAuthorizedAdmissionScope(command.scope)) return denied(ADMISSION_ERROR_CODE.permissionDenied);
    const resource = (await this.database.execute<{ environment: string; security_epoch: string }>(sql`select environment,security_epoch from public.messaging_connection_versions where connection_id=${command.scope.connectionId} and tribe_id=${command.scope.tribeId} and version=${command.scope.connectionVersion} for share`)).rows[0];
    if (!resource) return denied(ADMISSION_ERROR_CODE.proofUnavailable);
    if (!await this.hasStartedOperation(command)) return denied(ADMISSION_ERROR_CODE.permissionDenied);
    const request = (await this.database.execute<PendingRequestRow>(sql`select id,version,status,contact_type,normalized_contact,binding_id,source,invitation_id,expires_at from public.academy_admission_requests where id=${command.requestId} and user_id=${command.scope.userId} and tribe_id=${command.scope.tribeId} for update`)).rows[0];
    const requestDenial = await this.pendingRequestDenial(command, request);
    if (requestDenial) return denied(requestDenial);
    const origin = (await this.database.execute<{ challenge_id: string }>(sql`select challenge_id from public.academy_admission_verification_proofs where id=${command.proofId} and user_id=${command.scope.userId} and tribe_id=${command.scope.tribeId}`)).rows[0];
    if (!origin) return denied(ADMISSION_ERROR_CODE.proofUnavailable);
    // Keep challenge before proof in the shared order used by resend and local validation.
    const challenge = (await this.database.execute<{ channel: VerificationChallengeScope["channel"]; state: string; is_current: boolean; invalidated_at: string | null; contact_fingerprint: Uint8Array; fingerprint_key_id: string }>(sql`select channel,state,is_current,invalidated_at,contact_fingerprint,fingerprint_key_id from public.contact_verification_challenges where id=${origin.challenge_id} and user_id=${command.scope.userId} and tribe_id=${command.scope.tribeId} for share`)).rows[0];
    const row = (await this.database.execute<ProofRow>(sql`select * from public.academy_admission_verification_proofs where id=${command.proofId} and user_id=${command.scope.userId} and tribe_id=${command.scope.tribeId} for update`)).rows[0];
    if (!row || !isUsableChallenge(challenge)) return denied(ADMISSION_ERROR_CODE.proofUnavailable);
    if (!isSameProofDestination(row, command.scope.contact)) return denied(ADMISSION_ERROR_CODE.contactBindingConflict);
    const proof = proofFromRow(row, command.scope.contact, challenge.channel);
    const locked = await this.lockContactBinding(command);
    if ("denial" in locked) return denied(locked.denial);
    let binding = locked.binding;
    if (bindingConflicts(binding, request.binding_id, command.scope.userId)) return denied(ADMISSION_ERROR_CODE.contactBindingConflict);
    const config = await this.readSecurityConfig();
    if (isProofSecurityChanged(config, resource, command.scope.securityEpoch)) return denied(ADMISSION_ERROR_CODE.proofUnavailable);
    if (!await this.isAuthorized(command.scope)) return denied(ADMISSION_ERROR_CODE.permissionDenied);
    const now = new Date((await this.database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    if (now >= new Date(request.expires_at)) return denied(ADMISSION_ERROR_CODE.requestConflict);
    const proposal = proposeAdmissionProofApplication({ scope: command.scope, proof, requestId: request.id, now });
    if (proposal.outcome !== ADMISSION_PROOF_APPLICATION_OUTCOME.applied) return denied(ADMISSION_ERROR_CODE.proofUnavailable);
    binding ??= (await this.database.execute<{ id: string; owner_user_id: string }>(sql`insert into public.academy_admission_contact_bindings(tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,owner_user_id,first_request_id,first_proof_id,evidence_source) values (${command.scope.tribeId},${command.scope.contact.type},${command.scope.contact.value},${Buffer.from(challenge.contact_fingerprint)},${challenge.fingerprint_key_id},${command.scope.userId},${request.id},${row.id},${ADMISSION_EVIDENCE_KIND.local}) returning id,owner_user_id`)).rows[0];
    const requestVersion = request.version + 1;
    const updated = (await this.database.execute(sql`update public.academy_admission_requests set contact_type=${command.scope.contact.type},normalized_contact=${command.scope.contact.value},contact_fingerprint=${Buffer.from(challenge.contact_fingerprint)},fingerprint_key_id=${challenge.fingerprint_key_id},evidence_source=${ADMISSION_EVIDENCE_KIND.local},proof_id=${row.id},binding_id=${binding.id},version=${requestVersion} where id=${request.id} and version=${request.version} and status=${ADMISSION_REQUEST_STATUS.pending} returning id`)).rows[0];
    if (!updated) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
    const applied = (await this.database.execute<{ id: string; applied_at: Date | string }>(sql`update public.academy_admission_verification_proofs set status=${ADMISSION_PROOF_STATUS.applied},applied_request_id=${request.id},applied_at=${now} where id=${row.id} and status=${ADMISSION_PROOF_STATUS.available} returning id,applied_at`)).rows[0];
    if (!applied) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.proofUnavailable);
    await new PostgresAdmissionAuditRepository(this.database).appendMany([createAdmissionProofAuditEvent({
      tribeId: command.scope.tribeId, actorUserId: command.scope.userId,
      operationId: command.ledgerId, requestId: request.id, proofId: row.id,
      previousRequestVersion: request.version, createdAt: now,
    }), createAdmissionResourceAuditEvent({
      tribeId: command.scope.tribeId, actorUserId: command.scope.userId, operationId: command.ledgerId,
      resourceType: ADMISSION_AUDIT_RESOURCE_TYPE.proof, resourceId: applied.id,
      eventType: ADMISSION_PROOF_APPLICATION_AUDIT_EVENT, resourceVersion: null,
      rule: ADMISSION_PROOF_AUDIT_RULE, cause: null, createdAt: new Date(applied.applied_at),
      metadata: { fromState: row.status, toState: ADMISSION_PROOF_STATUS.applied, challengeId: row.challenge_id,
        requestId: request.id, verificationEpoch: row.verification_epoch, channel: challenge.channel },
    })]);
    await this.assertProtectionUnchanged(command, config);
    return { outcome: ADMISSION_PROOF_APPLICATION_OUTCOME.applied, requestId: request.id, requestVersion, status: ADMISSION_REQUEST_STATUS.pending, proofId: row.id };
  }
}
