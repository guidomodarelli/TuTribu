/** Applies proof, contact ownership and audit in the caller's guarded request/operation transaction. @module postgres-admission-verification-proof-writer */
import "server-only";
import { sql } from "drizzle-orm";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_RESOURCE_KIND } from "@/src/modules/academy-admissions/constants/admission-authorization";
import { ADMISSION_PROOF_AUDIT_EVENT, ADMISSION_PROOF_AUDIT_RULE, ADMISSION_PROOF_OPERATION, ADMISSION_CONTACT_BINDING_LOCK_DOMAIN, ADMISSION_PROOF_APPLICATION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-proof";
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
   * Applies an unused fresh proof to an existing own pending request without changing its original deadline.
   * @param command - Authorized original intent, expected request version and current operation ledger identity.
   * @returns A minimal stored transition; unexpected failures must roll back the enclosing transaction.
   * @throws AdmissionOperationError on an impossible CAS or lost current context after an effective write.
   */
  async applyToPending(command: ApplyAdmissionVerificationProofCommand): Promise<AdmissionProofApplicationResult> {
    const denied = (code: Extract<AdmissionProofApplicationResult, { outcome: "denied" }>["code"]): AdmissionProofApplicationResult => ({ outcome: ADMISSION_PROOF_APPLICATION_OUTCOME.denied, code });
    if (command.scope.purpose !== ADMISSION_VERIFICATION_PURPOSE.admission || !await this.isAuthorized(command.scope)) return denied(ADMISSION_ERROR_CODE.permissionDenied);
    const resource = (await this.database.execute<{ environment: string; security_epoch: string }>(sql`select environment,security_epoch from public.messaging_connection_versions where connection_id=${command.scope.connectionId} and tribe_id=${command.scope.tribeId} and version=${command.scope.connectionVersion} for share`)).rows[0];
    if (!resource) return denied(ADMISSION_ERROR_CODE.proofUnavailable);
    const operation = (await this.database.execute(sql`select id from public.academy_admission_operations where id=${command.ledgerId} and actor_user_id=${command.scope.userId} and tribe_id=${command.scope.tribeId} and operation_type=${ADMISSION_PROOF_OPERATION} and idempotency_key=${command.operationId} and state=${OPERATION_STATE.started} for share`)).rows[0];
    if (!operation) return denied(ADMISSION_ERROR_CODE.permissionDenied);
    const request = (await this.database.execute<PendingRequestRow>(sql`select id,version,status,contact_type,normalized_contact,binding_id,source,invitation_id,expires_at from public.academy_admission_requests where id=${command.requestId} and user_id=${command.scope.userId} and tribe_id=${command.scope.tribeId} for update`)).rows[0];
    if (!request || request.status !== ADMISSION_REQUEST_STATUS.pending || request.version !== command.expectedRequestVersion) return denied(ADMISSION_ERROR_CODE.requestConflict);
    if (request.normalized_contact !== null && (request.normalized_contact !== command.scope.contact.value || request.contact_type !== command.scope.contact.type)) return denied(ADMISSION_ERROR_CODE.contactBindingConflict);
    if (request.source === ADMISSION_SOURCE_KIND.personal) {
      const invitation = (await this.database.execute<{ contact_type: string; normalized_contact: string; status: string; authorization_revoked_at: string | null }>(sql`select contact_type,normalized_contact,status,authorization_revoked_at from public.academy_personal_invitations where id=${request.invitation_id} and tribe_id=${command.scope.tribeId} and redeemed_by_user_id=${command.scope.userId} and redeemed_request_id=${request.id} for share`)).rows[0];
      if (!invitation || invitation.status !== ADMISSION_INVITATION_STATUS.redeemed || invitation.authorization_revoked_at !== null) return denied(ADMISSION_ERROR_CODE.invitationUnavailable);
      if (invitation.contact_type !== command.scope.contact.type || invitation.normalized_contact !== command.scope.contact.value) return denied(ADMISSION_ERROR_CODE.contactBindingConflict);
    }
    const origin = (await this.database.execute<{ challenge_id: string }>(sql`select challenge_id from public.academy_admission_verification_proofs where id=${command.proofId} and user_id=${command.scope.userId} and tribe_id=${command.scope.tribeId}`)).rows[0];
    if (!origin) return denied(ADMISSION_ERROR_CODE.proofUnavailable);
    // Keep challenge before proof in the shared order used by resend and local validation.
    const challenge = (await this.database.execute<{ channel: VerificationChallengeScope["channel"]; state: string; is_current: boolean; invalidated_at: string | null; contact_fingerprint: Uint8Array; fingerprint_key_id: string }>(sql`select channel,state,is_current,invalidated_at,contact_fingerprint,fingerprint_key_id from public.contact_verification_challenges where id=${origin.challenge_id} and user_id=${command.scope.userId} and tribe_id=${command.scope.tribeId} for share`)).rows[0];
    const row = (await this.database.execute<ProofRow>(sql`select * from public.academy_admission_verification_proofs where id=${command.proofId} and user_id=${command.scope.userId} and tribe_id=${command.scope.tribeId} for update`)).rows[0];
    if (!row || !challenge || !challenge.is_current || challenge.state !== VERIFICATION_CHALLENGE_STATE.verified || challenge.invalidated_at !== null) return denied(ADMISSION_ERROR_CODE.proofUnavailable);
    if (row.contact_type !== command.scope.contact.type || row.normalized_contact !== command.scope.contact.value) return denied(ADMISSION_ERROR_CODE.contactBindingConflict);
    const proof: AdmissionVerificationProof = { id: row.id, challengeId: row.challenge_id, userId: row.user_id, tribeId: row.tribe_id, contact: command.scope.contact, purpose: ADMISSION_VERIFICATION_PURPOSE.admission, verificationEpoch: row.verification_epoch, connectionId: row.connection_id, connectionVersion: row.connection_version, securityEpoch: row.security_epoch, channel: challenge.channel, status: row.status, verifiedAt: new Date(row.verified_at), applyBefore: new Date(row.apply_before), appliedRequestId: row.applied_request_id, appliedAt: row.applied_at ? new Date(row.applied_at) : null, invalidatedAt: row.invalidated_at ? new Date(row.invalidated_at) : null, invalidationReason: row.invalidation_reason };
    await this.database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([ADMISSION_CONTACT_BINDING_LOCK_DOMAIN, command.scope.tribeId, command.scope.contact.type, command.scope.contact.value])},0))`);
    let binding = (await this.database.execute<{ id: string; owner_user_id: string }>(sql`select id,owner_user_id from public.academy_admission_contact_bindings where tribe_id=${command.scope.tribeId} and contact_type=${command.scope.contact.type} and normalized_contact=${command.scope.contact.value} for update`)).rows[0];
    if (binding && binding.owner_user_id !== command.scope.userId || request.binding_id !== null && binding?.id !== request.binding_id) return denied(ADMISSION_ERROR_CODE.contactBindingConflict);
    const config = await this.readSecurityConfig();
    if (config.recoveryLocked || config.environment !== resource.environment || config.securityEpoch !== resource.security_epoch || config.securityEpoch !== command.scope.securityEpoch) return denied(ADMISSION_ERROR_CODE.proofUnavailable);
    if (!await this.isAuthorized(command.scope)) return denied(ADMISSION_ERROR_CODE.permissionDenied);
    const now = new Date((await this.database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    if (now >= new Date(request.expires_at)) return denied(ADMISSION_ERROR_CODE.requestConflict);
    const proposal = proposeAdmissionProofApplication({ scope: command.scope, proof, requestId: request.id, now });
    if (proposal.outcome !== ADMISSION_PROOF_APPLICATION_OUTCOME.applied) return denied(ADMISSION_ERROR_CODE.proofUnavailable);
    if (!binding) {
      binding = (await this.database.execute<{ id: string; owner_user_id: string }>(sql`insert into public.academy_admission_contact_bindings(tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,owner_user_id,first_request_id,first_proof_id,evidence_source) values (${command.scope.tribeId},${command.scope.contact.type},${command.scope.contact.value},${Buffer.from(challenge.contact_fingerprint)},${challenge.fingerprint_key_id},${command.scope.userId},${request.id},${row.id},${ADMISSION_EVIDENCE_KIND.local}) returning id,owner_user_id`)).rows[0];
    }
    const requestVersion = request.version + 1;
    const updated = (await this.database.execute(sql`update public.academy_admission_requests set contact_type=${command.scope.contact.type},normalized_contact=${command.scope.contact.value},contact_fingerprint=${Buffer.from(challenge.contact_fingerprint)},fingerprint_key_id=${challenge.fingerprint_key_id},evidence_source=${ADMISSION_EVIDENCE_KIND.local},proof_id=${row.id},binding_id=${binding.id},version=${requestVersion} where id=${request.id} and version=${request.version} and status=${ADMISSION_REQUEST_STATUS.pending} returning id`)).rows[0];
    if (!updated) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
    const applied = (await this.database.execute(sql`update public.academy_admission_verification_proofs set status=${ADMISSION_PROOF_STATUS.applied},applied_request_id=${request.id},applied_at=${now} where id=${row.id} and status=${ADMISSION_PROOF_STATUS.available} returning id`)).rows[0];
    if (!applied) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.proofUnavailable);
    await this.database.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,resource_version,metadata,created_at) values (${command.scope.tribeId},${command.scope.userId},${ADMISSION_RESOURCE_KIND.request},${request.id},${command.ledgerId},${ADMISSION_PROOF_AUDIT_EVENT},${ADMISSION_PROOF_AUDIT_RULE},${requestVersion},${JSON.stringify({ proofId: row.id, previousRequestVersion: request.version })}::jsonb,${now})`);
    const currentConfig = await this.readSecurityConfig();
    if (currentConfig.recoveryLocked || currentConfig.environment !== config.environment || currentConfig.securityEpoch !== config.securityEpoch || !await this.isAuthorized(command.scope)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    return { outcome: ADMISSION_PROOF_APPLICATION_OUTCOME.applied, requestId: request.id, requestVersion, status: ADMISSION_REQUEST_STATUS.pending, proofId: row.id };
  }
}
