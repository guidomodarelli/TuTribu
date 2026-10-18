/** Owns manual request effects and their original ledger result inside protected SQL transactions. @module postgres-admission-request-repository */
import { snapshotAdmissionDecisionEvidence } from "@/src/modules/academy-admissions/domain/value-objects/admission-decision-evidence";
import type { AdmissionBatchDecisionIntent, AdmissionBatchDecisionItemResult, AdmissionBatchDecisionSnapshot, AdmissionBatchDecisionWriter } from "../../domain/repositories/admission-batch-decision-writer";
import { ADMISSION_BATCH_DECISION_OPERATION } from "../../constants/admission-batch-decision";
import { admissionBatchDecisionSnapshotSchema } from "../../constants/admission-batch-decision-schema";
import { ADMISSION_BATCH_ITEM_STATUS } from "../../constants/admission-public-contract";
import type { AdmissionAuditEvent } from "../../domain/entities/admission-audit-event";
import type { AdmissionNotificationObligation } from "../../domain/repositories/admission-repositories";
import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import { parsePhoneNumber } from "libphonenumber-js/max";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AcademyApprovedMembershipWriter } from "@/src/modules/tribes/domain/repositories/academy-approved-membership-writer";
import type { AdmissionCommandScope, AdmissionCommandWriter, AdmissionSubmissionIntent, AdmissionDecisionIntent, AdmissionCancellationIntent, AdmissionNotificationObligationWriter } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import type { AdmissionRequest, AdmissionRequestEvidence } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import type { AdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import type { AdmissionOperationCommand, AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { AdmissionActorFacts, AdmissionSubmissionFacts, AdmissionMembershipFacts } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { evaluateAdmissionSubmission } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { createPendingAdmissionRequest, proposeAdmissionCancellation, getAdmissionRetryAllowedAt } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import { proposeAdmissionDecision } from "@/src/modules/academy-admissions/domain/entities/admission-decision";
import { PostgresAdmissionAuthorizationReader, type AdmissionSubmissionActorContext } from "./postgres-admission-authorization-reader";
import { readLockedAdmissionFacts } from "./postgres-locked-admission-facts";
import { PostgresAdmissionOperationRepository } from "./postgres-admission-operation-repository";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { admissionCommittedOutcomeSchema, admissionTransitionResultSchema, admissionRetryResultSchema, type AdmissionSubmissionResult } from "@/src/modules/academy-admissions/application/results/admission-writer-result-schemas";
import { PostgresOwnAdmissionRequestReader } from "./postgres-own-admission-request-reader";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_ACTION, ADMISSION_DENIAL_REASON, ADMISSION_EVIDENCE_KIND, ADMISSION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_REQUEST_STATUS, ADMISSION_REQUEST_SOURCE, ADMISSION_OPERATION_TYPE, ADMISSION_REQUEST_EVENT } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_DECISION_ACTOR_KIND, ADMISSION_DECISION_RULE } from "@/src/modules/academy-admissions/constants/admission-decision";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { ADMISSION_DECISION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { TRIBE_FREE_JOIN_STATUS } from "@/src/modules/tribes/constants/tribe-story";
import type { AdmissionRetryWriter, AdmissionRetryIntent } from "@/src/modules/academy-admissions/domain/repositories/admission-retry-writer";
import { proposeAdmissionRetry } from "@/src/modules/academy-admissions/domain/policies/admission-retry";
import { proposeAdmissionExternalResolution } from "@/src/modules/academy-admissions/domain/policies/admission-external-resolution";
import { evaluateRecentAuthentication } from "@/src/modules/auth/domain/policies/recent-authentication";
import { isAuthenticatedSessionLive } from "@/src/modules/auth/domain/policies/authenticated-session-liveness";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import type { AdmissionExecutionCapabilitiesReader, AdmissionExecutionCapabilities } from "../../domain/repositories/admission-execution-capabilities";
import { MANUAL_ADMISSION_EXECUTION_CAPABILITIES } from "../../constants/admission-execution-capabilities";
import { PostgresAdmissionSubmissionProofReader } from "./postgres-admission-submission-proof-reader";
import { PostgresAdmissionVerificationProofWriter } from "./postgres-admission-verification-proof-writer";
import { ADMISSION_PROOF_APPLICATION_OUTCOME } from "../../constants/admission-proof";
import { ADMISSION_POLICY_MODE } from "../../constants/admission-policy";
import { readAllowlistAdmissionFacts } from "./postgres-allowlist-admission-facts";
import { bindBaseAdmissionContact } from "./postgres-base-admission-binding";
import { assertUnreservedAdmissionContact } from "./assert-unreserved-admission-contact";
import { proposeAutomaticAdmissionDecision, type AutomaticAdmissionFacts } from "../../domain/entities/automatic-admission-decision";
import { readAdmissionReviewEvidence } from "./postgres-admission-review-evidence";
import { admissionCommandDenialSchema } from "../../constants/admission-command-denial-schema";
import { ADMISSION_COMMAND_EFFECT_SQL } from "../../constants/admission-command-denial";
import { createAdmissionCommandSnapshotSchema } from "../../application/results/admission-command-snapshot";
import { resolvePersonalInvitationForRedemption, commitPersonalInvitationRedemption, assertPersonalInvitationTokenCurrent } from "./postgres-personal-invitation-redemption";
import type { LegacyAdmissionInvitationReader } from "../../domain/repositories/legacy-admission-invitation-reader";
import { ADMISSION_OPERATION_TRIBE_LOCK_SQL } from "../../constants/admission-operation";
import { createAdmissionRequestAuditEvent, createAdmissionRetryAuditEvent, type AdmissionRequestAuditInput, type AdmissionRequestAuditDecision } from "../../domain/entities/admission-request-audit-event";
import { PostgresAdmissionAuditRepository } from "./postgres-admission-audit-repository";
import { readAdmissionPolicy } from "./postgres-admission-policy-storage";
import type { AdmissionWhatsappNumberWriter, AdmissionWhatsappNumberIntent, AdmissionWhatsappNumberResult } from "../../domain/repositories/admission-whatsapp-number-writer";
import { proposeAdmissionWhatsappNumberChange } from "../../domain/value-objects/admission-whatsapp-number";
import { createAdmissionWhatsappNumberAuditEvent } from "../../domain/entities/admission-whatsapp-number-audit-event";
import { ADMISSION_WHATSAPP_OPERATION, ADMISSION_WHATSAPP_CHANGE_OUTCOME } from "../../constants/admission-whatsapp-number";
import { admissionWhatsappNumberResultSchema } from "../../application/results/admission-writer-result-schemas";
import { admissionRequestSchema } from "../../application/results/admission-flow-result-schemas";

/** Every checkout reuses the trusted request actor; a client cannot select the database principal. */
type AdmissionDatabaseExecutor = <Result>(scope: AdmissionCommandScope, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Related owners are composed onto the same original transaction, with no provider work. */
type AdmissionTransactionCollaborators = { memberships: AcademyApprovedMembershipWriter; notifications: AdmissionNotificationObligationWriter; lockSubmissionScope: (scope: AdmissionCommandScope) => Promise<boolean>; readSubmissionActor?: (scope: AdmissionCommandScope) => Promise<AdmissionSubmissionActorContext>; legacyInvitations?: LegacyAdmissionInvitationReader };
/** Batch facts remain local to one transaction holding their actual scope/account/member locks. */
type AdmissionBatchFacts = { actor: AdmissionActorFacts; byApplicant: Map<string, AdmissionSubmissionFacts> };
/** Immutable events are flushed once before the same business transaction completes. */
type AdmissionBatchEffects = { notifications: AdmissionNotificationObligation[]; audit: AdmissionAuditEvent[] };
/** A prepared batch context changes only transport work, never the domain decision or final authority guard. */
type AdmissionPreparedDecision = { facts: AdmissionSubmissionFacts; actor: AdmissionActorFacts; effects: AdmissionBatchEffects };
/** Owned row fields are consumed directly; this is not a schema for a PostgreSQL response. */
type RequestRow = {
  id: string; tribe_id: string; user_id: string; source: AdmissionRequest["source"]; invitation_id: string | null; legacy_invitation_id: string | null;
  contact_type: "email" | "phone" | null; normalized_contact: string | null; evidence_source: "none" | "declared" | "base" | "local";
  proof_id: string | null; binding_id: string | null; requires_allowlist: boolean; original_policy_snapshot: AdmissionRequest["originalPolicy"];
  whatsapp_number: string | null; applicant_message: string | null; status: AdmissionRequest["status"]; submitted_at: string; expires_at: string; version: number;
  decision_id: string | null; cancel_reason: string | null; retry_allowed_at: string | null; resolved_at: string | null;
  global_identity_evidence_id: string | null; evidence_verified_at: string | null;
};

/** SQL clock is sampled after all preceding locks/facts instead of before their waits. */
async function databaseNow(database: RequestDatabase): Promise<Date> { return new Date((await database.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now); }

/** Maps only the recorded evidence provenance; cancel/reject do not turn that metadata into admission authority. */
function requestEvidence(row: RequestRow): AdmissionRequestEvidence {
  if (row.evidence_source === ADMISSION_EVIDENCE_KIND.none || row.evidence_source === ADMISSION_EVIDENCE_KIND.declared) return { kind: row.evidence_source };
  if (row.evidence_source === ADMISSION_EVIDENCE_KIND.local && row.proof_id && row.evidence_verified_at) return { kind: ADMISSION_EVIDENCE_KIND.local, proofId: row.proof_id, verifiedAt: new Date(row.evidence_verified_at) };
  if (row.evidence_source === ADMISSION_EVIDENCE_KIND.base && row.global_identity_evidence_id && row.evidence_verified_at) return { kind: ADMISSION_EVIDENCE_KIND.base, identityEvidenceId: row.global_identity_evidence_id, verifiedAt: new Date(row.evidence_verified_at) };
  throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
}

/** Manual common/OFF writer; personal redemption and local verification are extended in their owning stories. */
export class PostgresAdmissionRequestRepository implements AdmissionCommandWriter<AdmissionSubmissionResult>, AdmissionBatchDecisionWriter, AdmissionRetryWriter, AdmissionExecutionCapabilitiesReader, AdmissionWhatsappNumberWriter {
  /** @param execute - Guarded actual actor executor. @param readSecurityConfig - Live local platform keyrings/recovery state. @param compose - Explicit DB-only membership and notification owners. */
  constructor(private readonly execute: AdmissionDatabaseExecutor, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>, private readonly compose: (database: RequestDatabase) => AdmissionTransactionCollaborators) {}

  /** @returns Actual common, personal and historical coverage consumed by submission and activation guards. */
  getCapabilities(): AdmissionExecutionCapabilities {
    return { sources: [...MANUAL_ADMISSION_EXECUTION_CAPABILITIES.sources], policyModes: [...MANUAL_ADMISSION_EXECUTION_CAPABILITIES.policyModes], additionalVerification: MANUAL_ADMISSION_EXECUTION_CAPABILITIES.additionalVerification };
  }

  /**
   * Locks current authority in tribe/account order for each registry or effect phase.
   * @param database - Original guarded transaction for this phase.
   * @param scope - Native actor/session/tribe, never browser-selected authority.
   * @param operation - Owner-selected action whose current permission is checked.
   * @param requestId - Existing own request when the action targets one.
   * @param registrationOnly - Whether only an intent claim is registered; administrative effects retain the exclusive tribe lock.
   * @returns Whether the current actor can perform the exact action.
   * @throws AdmissionOperationError when scope, native session or required recency is unavailable.
   */
  private async authorize(database: RequestDatabase, scope: AdmissionCommandScope, operation: string, requestId?: string, registrationOnly = false): Promise<boolean> {
    const scopeLock = registrationOnly ? ADMISSION_OPERATION_TRIBE_LOCK_SQL.registration : ADMISSION_OPERATION_TRIBE_LOCK_SQL.execution;
    const collaborators = operation === ADMISSION_OPERATION_TYPE.submit ? this.compose(database) : null;
    let actor: AdmissionActorFacts | null;
    if (collaborators?.readSubmissionActor) {
      const current = await collaborators.readSubmissionActor(scope);
      if (!current.scopeLocked) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      actor = current.actor;
    } else {
      const locked = collaborators
        ? await collaborators.lockSubmissionScope(scope)
        : Boolean((await database.execute(sql`select id from public.tribes where id=${scope.tribeId} ${sql.raw(scopeLock)}`)).rows[0]);
      if (!locked) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      actor = await new PostgresAdmissionAuthorizationReader(database, scope.sessionId, ADMISSION_ACTION.readOwnRequest).getCurrentActorWithLockedAccount(scope.tribeId, scope.userId);
    }
    if (!actor) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    if (!requestId) return true;
    const request = (await database.execute<{ user_id: string }>(sql`select user_id from public.academy_admission_requests where id=${requestId} and tribe_id=${scope.tribeId}`)).rows[0];
    if (!request) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    if (operation === ADMISSION_WHATSAPP_OPERATION) return request.user_id === scope.userId;
    const reviewer = actor.status === TRIBE_MEMBERSHIP_STATUS.active && (actor.role === TRIBE_MEMBER_ROLE.leader || actor.role === TRIBE_MEMBER_ROLE.guardian);
    if (operation === ADMISSION_OPERATION_TYPE.decide) return reviewer && request.user_id !== scope.userId;
    if (operation === ADMISSION_OPERATION_TYPE.allowRetry) {
      if (actor.role !== TRIBE_MEMBER_ROLE.leader || actor.status !== TRIBE_MEMBERSHIP_STATUS.active) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
      await database.execute(sql`select intent_id from public.recent_authentication_evidence where user_id=${scope.userId} and session_id=${scope.sessionId} and tribe_id=${scope.tribeId} and operation=${REAUTHENTICATION_OPERATION.advanceAdmissionRetry} and resource_id=${requestId} for share`);
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: scope.userId, sessionId: scope.sessionId }), (_identity, run) => run(database));
      const current = await accounts.getAuthenticatedAccount();
      if (!current) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      if (!current?.googleAccount) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.reauthenticationRequired);
      const recentScope = { userId: scope.userId, sessionId: scope.sessionId, accountId: current.googleAccount.id, subject: current.googleAccount.subject, tribeId: scope.tribeId, operation: REAUTHENTICATION_OPERATION.advanceAdmissionRetry, resourceId: requestId };
      const now = await databaseNow(database);
      if (!isAuthenticatedSessionLive(current.session.expiresAt, now)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      if (!current.recentAuthentication.some((evidence) => evaluateRecentAuthentication({ now, scope: recentScope, evidence, sessionActive: true, currentLeaderUserId: actor.userId }).allowed)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.reauthenticationRequired);
      return true;
    }
    return request.user_id === scope.userId || actor.role === TRIBE_MEMBER_ROLE.leader && actor.status === TRIBE_MEMBERSHIP_STATUS.active;
  }

  /** Reads current configuration without fabricating a policy for missing historical storage. */
  private async policy(database: RequestDatabase, tribeId: string): Promise<AdmissionPolicy | null> {
    return readAdmissionPolicy(database, tribeId, false);
  }

  /** Reads original provenance for every terminal action; approval authority remains a separate current evaluation. */
  private async request(database: RequestDatabase, tribeId: string, requestId?: string, userId?: string): Promise<AdmissionRequest | null> {
    const row = (await database.execute<RequestRow>(sql`select request.id,request.tribe_id,request.user_id,request.source,request.invitation_id,request.legacy_invitation_id,request.contact_type,request.normalized_contact,request.evidence_source,request.proof_id,request.binding_id,request.requires_allowlist,request.original_policy_snapshot,request.applicant_message,request.whatsapp_number,request.status,request.submitted_at,request.expires_at,request.version,request.decision_id,request.cancel_reason,request.retry_allowed_at,request.global_identity_evidence_id,(select decided_at from public.academy_admission_decisions where id=request.decision_id) as resolved_at,case when request.evidence_source=${ADMISSION_EVIDENCE_KIND.local} then (select verified_at from public.academy_admission_verification_proofs where id=request.proof_id) when request.evidence_source=${ADMISSION_EVIDENCE_KIND.base} then (select verified_at from public.global_identity_evidence where id=request.global_identity_evidence_id) end as evidence_verified_at from public.academy_admission_requests request where request.tribe_id=${tribeId} ${requestId ? sql`and request.id=${requestId}` : sql`and request.user_id=${userId} order by request.submitted_at desc,request.id desc limit 1`} for update of request`)).rows[0];
    if (!row) return null;
    const contact = row.contact_type === ADMISSION_CONTACT_TYPE.email && row.normalized_contact ? { type: ADMISSION_CONTACT_TYPE.email, value: row.normalized_contact }
      : row.contact_type === ADMISSION_CONTACT_TYPE.phone && row.normalized_contact ? { type: ADMISSION_CONTACT_TYPE.phone, value: row.normalized_contact, country: parsePhoneNumber(row.normalized_contact).country ?? "" } : null;
    return { id: row.id, tribeId: row.tribe_id, userId: row.user_id, source: row.source, invitationId: row.invitation_id, legacyInvitationId: row.legacy_invitation_id, requiresAllowlist: row.requires_allowlist, contact, evidence: requestEvidence(row), bindingId: row.binding_id, proofId: row.proof_id, originalPolicy: row.original_policy_snapshot, applicantMessage: row.applicant_message, whatsappNumber: row.whatsapp_number, status: row.status, submittedAt: new Date(row.submitted_at), expiresAt: new Date(row.expires_at), version: row.version, decisionId: row.decision_id, cancelReason: row.cancel_reason, resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null, retryAllowedAt: row.retry_allowed_at ? new Date(row.retry_allowed_at) : null };
  }

  /** Own current facts are resolved after locks; no sender or external key can participate. */
  private async facts(database: RequestDatabase, scope: AdmissionCommandScope, contact: AdmissionSubmissionFacts["contact"], applicantId = scope.userId): Promise<AdmissionSubmissionFacts> {
    const { tribe, policy, membership, account } = await readLockedAdmissionFacts(database, scope.tribeId, applicantId);
    const config = await this.readSecurityConfig(), now = await databaseNow(database);
    return { now, tribe: { id: scope.tribeId, isAcademy: tribe?.accessModel === TRIBE_ACCESS_MODEL.academy, controlActivated: Boolean(tribe?.activatedAt), evaluatorEnabled: Boolean(tribe?.admissionEnabled), recoveryLocked: config.recoveryLocked }, policy,
      account: account ? { userId: applicantId, normalizedEmail: account.email.trim().toLowerCase(), googleAccount: null } : null,
      contact, source: { kind: ADMISSION_REQUEST_SOURCE.common }, membership, baseEvidence: null, localProof: null, currentConnection: null, contactBinding: null, allowlistEntry: null };
  }

  /** Recovers an original committed result after possible COMMIT response loss without repeating the write. */
  private async run<Result>(scope: AdmissionCommandScope, command: AdmissionOperationCommand, schema: z.ZodType<Result>, mutate: (database: RequestDatabase, ledgerId: string) => Promise<Result>, requestId?: string): Promise<AdmissionOperationResult<Result>> {
    const ledger = new PostgresAdmissionOperationRepository((work) => this.execute(scope, work), (database) => this.authorize(database, scope, command.operationType, requestId), this.readSecurityConfig, (database) => this.authorize(database, scope, command.operationType, requestId, true));
    const snapshotSchema = createAdmissionCommandSnapshotSchema(schema);
    let original;
    let originalDenialCause: unknown;
    try { original = await ledger.run(command, snapshotSchema, async (database, ledgerId) => {
      await database.execute(sql.raw(ADMISSION_COMMAND_EFFECT_SQL.begin));
      try {
        const result = await mutate(database, ledgerId);
        await database.execute(sql.raw(ADMISSION_COMMAND_EFFECT_SQL.release));
        return result;
      } catch (error) {
        const denial = error instanceof AdmissionOperationError ? admissionCommandDenialSchema.safeParse({ outcome: ADMISSION_OUTCOME.denied, code: error.code, admissionRequestId: requestId ?? null }) : null;
        if (!denial?.success) throw error;
        originalDenialCause = error;
        await database.execute(sql.raw(ADMISSION_COMMAND_EFFECT_SQL.rollback));
        await database.execute(sql.raw(ADMISSION_COMMAND_EFFECT_SQL.release));
        return denial.data;
      }
    }); }
    catch (error) {
      if (!(error instanceof AdmissionOperationError) || error.code !== ADMISSION_ERROR_CODE.operationUnresolved) throw error;
      try { original = await ledger.read(command, snapshotSchema); }
      catch (reconciliationError) {
        if (reconciliationError instanceof AdmissionOperationError) throw reconciliationError;
        throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: command.idempotencyKey, cause: new AggregateError([error, reconciliationError], "Admission command original operation reconciliation failed", { cause: error }) });
      }
      if (original?.state !== OPERATION_STATE.completed) throw error;
    }
    if (original.state === OPERATION_STATE.started) return original;
    const denial = admissionCommandDenialSchema.safeParse(original.result);
    if (denial.success) throw new AdmissionOperationError(denial.data.code, { ...(originalDenialCause !== undefined ? { cause: originalDenialCause } : {}), operationId: original.operationId, operationState: OPERATION_STATE.completed });
    return { ...original, result: schema.parse(original.result) };
  }

  /** @param database - Original authorized transaction. @param scope - Actual command actor. @param request - Current committed proposal. @param ledgerId - Original private registry identity. @param event - Owner-selected lifecycle event. @param previous - Locked prior lifecycle or absence for the presentation. @param decision - Effective decision policy/rule/clock or initial absence. @param batchEffects - Optional transaction-local facts collected for one bounded bulk flush. @returns After staging notice and reconstructible audit within the same commit. */
  private async record(database: RequestDatabase, scope: AdmissionCommandScope, request: AdmissionRequest, ledgerId: string, event: AdmissionRequestAuditInput["eventType"], previous: AdmissionRequestAuditInput["previous"], decision: AdmissionRequestAuditDecision|null, batchEffects?: AdmissionBatchEffects): Promise<void> {
    const obligation: AdmissionNotificationObligation = { id: randomUUID(), tribeId: scope.tribeId, admissionRequestId: request.id, applicantUserId: request.userId, event, operationId: ledgerId };
    const audit = createAdmissionRequestAuditEvent({actorUserId:scope.userId,operationId:ledgerId,eventType:event,request,previous,decision});
    if (batchEffects) { batchEffects.notifications.push(obligation); batchEffects.audit.push(audit); return; }
    await this.compose(database).notifications.record(obligation);
    await new PostgresAdmissionAuditRepository(database).append(audit);
  }

  /** Submits common-policy and personal presentations with current own evidence; existing membership/pending precedes lookup, redemption and proof effects. */
  async submit(input: AdmissionSubmissionIntent) {
    const command = { actorUserId: input.userId, tribeId: input.tribeId, operationType: ADMISSION_OPERATION_TYPE.submit, idempotencyKey: input.operationId, intent: { expectedPolicyVersion: input.expectedPolicyVersion, source: input.source, contact: input.contact, proofId: input.proofId, message: input.message, ...(input.whatsappNumber !== undefined ? { whatsappNumber: input.whatsappNumber } : {}), confirmed: input.confirmed } };
    return this.run(input, command, admissionCommittedOutcomeSchema, async (database, ledgerId): Promise<AdmissionSubmissionResult> => {
      const facts: AutomaticAdmissionFacts = { ...await this.facts(database, input, input.contact), whatsappNumber: input.whatsappNumber ?? null, source: { kind: ADMISSION_REQUEST_SOURCE.common }, allowlistEntry: null, baseEvidence: null };
      const existing = facts.membership;
      const previous = await this.request(database, input.tribeId, undefined, input.userId);
      facts.now = await databaseNow(database);
      if (existing?.status === TRIBE_MEMBERSHIP_STATUS.active || existing?.status === TRIBE_MEMBERSHIP_STATUS.muted) {
        if (previous?.status === ADMISSION_REQUEST_STATUS.pending) await this.resolveExternalMembership(database, input, previous, ledgerId, facts);
        return { operationId: input.operationId, outcome: ADMISSION_OUTCOME.alreadyMember, admissionRequestId: null, committedRequestVersion: null, membership: { role: existing.role, status: existing.status }, created: false };
      }
      if (previous?.status === ADMISSION_REQUEST_STATUS.pending && facts.now < previous.expiresAt) return this.pendingResult(database, input, previous, false);
      if (previous && facts.now < getAdmissionRetryAllowedAt(previous)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
      if (previous?.status === ADMISSION_REQUEST_STATUS.pending) await this.expire(database, input, previous, ledgerId, facts.policy);
      if (!facts.policy || facts.policy.version !== input.expectedPolicyVersion) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
      const coverage = this.getCapabilities();
      if (!coverage.sources.includes(input.source.kind)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
      if (facts.policy.requiresAdditionalVerification && !coverage.additionalVerification) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.additionalVerificationRequired);
      if (!coverage.policyModes.includes(facts.policy.mode)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
      if (facts.policy.contactType === ADMISSION_CONTACT_TYPE.phone && input.contact?.type === ADMISSION_CONTACT_TYPE.email) facts.contact = null;
      if (facts.contact) await assertUnreservedAdmissionContact(database, input.tribeId, facts.contact, this.readSecurityConfig);
      const personal = input.source.kind === ADMISSION_REQUEST_SOURCE.personal ? await resolvePersonalInvitationForRedemption(database, input, input.source.token, await this.readSecurityConfig()) : null;
      const legacy = input.source.kind === ADMISSION_REQUEST_SOURCE.legacy ? await this.compose(database).legacyInvitations?.findActiveByToken({ userId: input.userId, sessionId: input.sessionId, tribeId: input.tribeId, token: input.source.token }) : null;
      if (input.source.kind === ADMISSION_REQUEST_SOURCE.legacy && !legacy) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invitationUnavailable);
      if (legacy) facts.source = { kind: ADMISSION_REQUEST_SOURCE.legacy };
      if (personal) facts.source = { kind: ADMISSION_REQUEST_SOURCE.personal, invitation: { id: personal.invitation.id, version: personal.invitation.version, tribeId: personal.invitation.tribeId, contact: personal.invitation.contact, requiresAllowlist: personal.invitation.requiresAllowlist, status: personal.invitation.status, authorizationRevoked: personal.invitation.authorizationRevokedAt !== null, expiresAt: personal.invitation.expiresAt } };
      if (facts.policy.mode === ADMISSION_POLICY_MODE.allowlist || personal) Object.assign(facts, await readAllowlistAdmissionFacts(database, input, facts.contact));
      const local = facts.policy.requiresAdditionalVerification && input.proofId ? await new PostgresAdmissionSubmissionProofReader(database, this.readSecurityConfig).read(input, input.proofId, facts) : null;
      if (facts.policy.requiresAdditionalVerification && input.proofId && !local) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.proofUnavailable);
      if (local) { facts.localProof = local.proof; facts.currentConnection = local.currentConnection; facts.contactBinding = local.contactBinding; }
      facts.now = await databaseNow(database);
      const eligibility = evaluateAdmissionSubmission(facts);
      if (eligibility.outcome === ADMISSION_OUTCOME.denied && eligibility.reason === ADMISSION_DENIAL_REASON.whatsappNumberRequired) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.whatsappNumberRequired);
      if (eligibility.outcome === ADMISSION_OUTCOME.verificationRequired) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.additionalVerificationRequired);
      if (eligibility.outcome === ADMISSION_OUTCOME.denied && eligibility.reason === ADMISSION_DENIAL_REASON.contactConflict) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.contactBindingConflict);
      if (eligibility.outcome !== ADMISSION_OUTCOME.pending && eligibility.outcome !== ADMISSION_OUTCOME.admitted) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
      if (eligibility.outcome === ADMISSION_OUTCOME.pending && eligibility.requiresExceptionReason && !input.message?.trim()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      const request = createPendingAdmissionRequest({ id: randomUUID(), tribeId: input.tribeId, userId: input.userId, source: personal ? ADMISSION_REQUEST_SOURCE.personal : legacy ? ADMISSION_REQUEST_SOURCE.legacy : ADMISSION_REQUEST_SOURCE.common, ...(personal ? { invitationId: personal.invitation.id } : {}), ...(legacy ? { legacyInvitationId: legacy.id } : {}), requiresAllowlist: personal?.invitation.requiresAllowlist ?? facts.policy.mode === ADMISSION_POLICY_MODE.allowlist, contact: facts.contact, evidence: { kind: eligibility.evidenceKind === ADMISSION_EVIDENCE_KIND.none ? ADMISSION_EVIDENCE_KIND.none : ADMISSION_EVIDENCE_KIND.declared }, policy: facts.policy, message: input.message, whatsappNumber: facts.whatsappNumber, now: await databaseNow(database) });
      await database.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,invitation_id,legacy_invitation_id,requires_allowlist,contact_type,normalized_contact,evidence_source,original_policy_snapshot,applicant_message,whatsapp_number,submitted_at,expires_at) values (${request.id},${request.tribeId},${request.userId},${request.source},${request.invitationId},${request.legacyInvitationId},${request.requiresAllowlist},${request.contact?.type ?? null},${request.contact?.value ?? null},${request.evidence.kind},${JSON.stringify(request.originalPolicy)}::jsonb,${request.applicantMessage},${request.whatsappNumber ?? null},${request.submittedAt},${request.expiresAt})`);
      if (personal && input.source.kind === ADMISSION_REQUEST_SOURCE.personal) await commitPersonalInvitationRedemption(database, input, personal, request, ledgerId, input.source.token, await this.readSecurityConfig());
      let committed = request;
      if (local && input.proofId) {
        const applied = await new PostgresAdmissionVerificationProofWriter(database, async (current, candidate) => {
          if (current !== database || candidate.userId !== input.userId || candidate.tribeId !== input.tribeId || candidate.purpose !== local.scope.purpose || candidate.contact.type !== local.scope.contact.type || candidate.contact.value !== local.scope.contact.value) return false;
          if (!await this.authorize(current, input, ADMISSION_OPERATION_TYPE.submit)) return false;
          const policy = await this.policy(current, input.tribeId);
          return Boolean(policy?.requiresAdditionalVerification && policy.verificationEpoch === candidate.verificationEpoch && policy.messagingConnectionId === candidate.connectionId && policy.messagingConnectionVersion === candidate.connectionVersion);
        }, this.readSecurityConfig).applyToPending({ scope: local.scope, requestId: request.id, proofId: input.proofId, expectedRequestVersion: request.version, operationId: input.operationId, ledgerId, operationType: ADMISSION_OPERATION_TYPE.submit });
        if (applied.outcome !== ADMISSION_PROOF_APPLICATION_OUTCOME.applied) throw new AdmissionOperationError(applied.code);
        const current = await this.request(database, input.tribeId, request.id);
        if (!current || current.version !== applied.requestVersion || current.proofId?.toLowerCase() !== input.proofId.toLowerCase()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
        committed = current;
      }
      if (eligibility.evidenceKind === ADMISSION_EVIDENCE_KIND.base) {
        await bindBaseAdmissionContact(database, input, committed, facts, await this.readSecurityConfig());
        const current = await this.request(database, input.tribeId, committed.id);
        if (!current) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
        committed = current;
      }
      let outcome: AdmissionSubmissionResult;
      if (eligibility.outcome === ADMISSION_OUTCOME.admitted) outcome = await this.approveAutomatic(database, input, committed, facts, ledgerId);
      else { await this.record(database, input, committed, ledgerId, ADMISSION_REQUEST_EVENT.pendingCreated, null, null); outcome = await this.pendingResult(database, input, committed, true); }
      if (personal && input.source.kind === ADMISSION_REQUEST_SOURCE.personal) await assertPersonalInvitationTokenCurrent(personal, input.source.token, await this.readSecurityConfig());
      return outcome;
    });
  }

  /** @param database - Original protected submission transaction. @param input - Actual applicant and original operation. @param request - Bound own request/evidence already staged. @param facts - Current private exact match and policy. @param ledgerId - Same original ledger. @returns Minimal committed automatic result; no pending reviewer notice is created. */
  private async approveAutomatic(database: RequestDatabase, input: AdmissionSubmissionIntent, request: AdmissionRequest, facts: AutomaticAdmissionFacts, ledgerId: string): Promise<AdmissionSubmissionResult> {
    const proposal = proposeAutomaticAdmissionDecision({ facts, request, decisionId: randomUUID(), now: await databaseNow(database) });
    if (!proposal.allowed) throw new AdmissionOperationError(proposal.code);
    const decision = proposal.decision, effectId = randomUUID();
    await database.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,decided_at,membership_effect_id,evidence_snapshot,allowlist_entry_id,allowlist_entry_version) values (${decision.id},${request.id},${input.tribeId},${input.userId},${request.version},${decision.outcome},${decision.actorUserId},${decision.actorKind},${decision.rule},${decision.policyVersion},${decision.verificationEpoch},${decision.decidedAt},${effectId},${JSON.stringify(decision.evidenceSnapshot)}::jsonb,${proposal.authorization?.entryId ?? null},${proposal.authorization?.version ?? null})`);
    await this.transition(database, request, proposal.request);
    const applied = await this.compose(database).memberships.apply({ tribeId: input.tribeId, userId: input.userId, decisionId: decision.id });
    if (applied.status !== TRIBE_FREE_JOIN_STATUS.joined) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
    await this.record(database, input, proposal.request, ledgerId, ADMISSION_REQUEST_EVENT.approved, request, decision);
    return { operationId: input.operationId, outcome: ADMISSION_OUTCOME.admitted, admissionRequestId: request.id, committedRequestVersion: proposal.request.version, membership: { role: applied.member.role, status: applied.member.status === TRIBE_MEMBERSHIP_STATUS.muted ? TRIBE_MEMBERSHIP_STATUS.muted : TRIBE_MEMBERSHIP_STATUS.active }, created: true };
  }

  /**
   * Closes a pending presentation when a current legitimate membership already resolved access.
   * @param database - Original protected submission transaction, holding tribe/account/member/request locks.
   * @param scope - Actual authenticated applicant and fixed tenant.
   * @param request - Original pending presentation without substituting any contact or authorization.
   * @param ledgerId - Original submission ledger committed with the resolution.
   * @param facts - Current locked membership/product/account/policy facts, never browser flags.
   * @returns After decision, transition, audit and internal notice are staged without a new membership effect.
   */
  private async resolveExternalMembership(database: RequestDatabase, scope: AdmissionCommandScope, request: AdmissionRequest, ledgerId: string, facts: AdmissionSubmissionFacts): Promise<void> {
    const now = await databaseNow(database);
    if (now >= request.expiresAt) return this.expire(database, scope, request, ledgerId, facts.policy);
    const proposal = proposeAdmissionExternalResolution({ request, expectedVersion: request.version, decisionId: randomUUID(), now,
      facts: { tribeId: facts.tribe.id, userId: scope.userId, academyAvailable: facts.tribe.isAcademy, accountAvailable: facts.account !== null, membershipDeleted: false, membership: facts.membership, policy: facts.policy } });
    if (!proposal.allowed) throw new AdmissionOperationError(proposal.code);
    if (!proposal.changed) return;
    const decision = proposal.decision;
    await database.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,decided_at,evidence_snapshot) values (${decision.id},${decision.requestId},${decision.tribeId},${decision.userId},${decision.requestVersion},${decision.outcome},${decision.actorUserId},${decision.actorKind},${decision.rule},${decision.policyVersion},${decision.verificationEpoch},${decision.decidedAt},${JSON.stringify(decision.evidenceSnapshot)}::jsonb)`);
    await this.transition(database, request, proposal.request);
    await this.record(database, scope, proposal.request, ledgerId, ADMISSION_REQUEST_EVENT.cancelled, request, decision);
  }

  /** Captures the own committed response inside the original transaction; replay never substitutes a current state. */
  private async pendingResult(database: RequestDatabase, input: AdmissionSubmissionIntent, request: AdmissionRequest, created: boolean): Promise<AdmissionSubmissionResult> {
    const own = await new PostgresOwnAdmissionRequestReader((_scope, run) => run(database), async () => (await this.readSecurityConfig()).recoveryLocked).readOwn(input);
    const snapshot = own ? admissionRequestSchema.parse(own) : null;
    if (!snapshot || snapshot.id !== request.id || snapshot.status !== ADMISSION_REQUEST_STATUS.pending || snapshot.version !== request.version) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
    return { operationId: input.operationId, outcome: ADMISSION_OUTCOME.pending, admissionRequestId: request.id, committedRequestVersion: request.version, membership: null, requestSnapshot: { ...snapshot, status: ADMISSION_REQUEST_STATUS.pending }, created };
  }

  /** @param input - Own canonical declared number and original observed version. @returns Confirmed minimal lineage or original registered progress, with no message or evidence changes. */
  async updateWhatsappNumber(input: AdmissionWhatsappNumberIntent): Promise<AdmissionOperationResult<AdmissionWhatsappNumberResult>> {
    const command: AdmissionOperationCommand = { actorUserId: input.userId, tribeId: input.tribeId, operationType: ADMISSION_WHATSAPP_OPERATION, idempotencyKey: input.operationId,
      intent: { requestId: input.admissionRequestId, expectedVersion: input.expectedVersion, whatsappNumber: input.whatsappNumber, confirmed: input.confirmed } };
    return this.run(input, command, admissionWhatsappNumberResultSchema, async (database, ledgerId) => {
      const request = await this.request(database, input.tribeId, input.admissionRequestId);
      if (!request) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const policy = await this.policy(database, input.tribeId);
      if (!policy) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const changedAt = await databaseNow(database);
      const proposal = proposeAdmissionWhatsappNumberChange({ request, policy, actorUserId: input.userId, expectedVersion: input.expectedVersion, whatsappNumber: input.whatsappNumber, now: changedAt });
      if (proposal.outcome === ADMISSION_WHATSAPP_CHANGE_OUTCOME.denied) throw new AdmissionOperationError(proposal.code);
      const changed = proposal.outcome === ADMISSION_WHATSAPP_CHANGE_OUTCOME.changed;
      if (changed) {
        const saved = (await database.execute(sql`update public.academy_admission_requests set whatsapp_number=${proposal.request.whatsappNumber ?? null},version=${proposal.request.version} where tribe_id=${input.tribeId} and id=${request.id} and user_id=${input.userId} and status=${ADMISSION_REQUEST_STATUS.pending} and version=${input.expectedVersion} returning id`)).rows[0];
        if (!saved) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
        await new PostgresAdmissionAuditRepository(database).append(createAdmissionWhatsappNumberAuditEvent({ actorUserId: input.userId, operationId: ledgerId, previous: request, request: proposal.request, policy, changedAt }));
      }
      return { admissionRequestId: request.id, version: proposal.request.version, changed };
    }, input.admissionRequestId);
  }

  /** Writes exactly one terminal decision and its basic effect/obligations before completion. */
  async decide(input: AdmissionDecisionIntent) {
    const command = { actorUserId: input.userId, tribeId: input.tribeId, operationType: ADMISSION_OPERATION_TYPE.decide, idempotencyKey: input.operationId, intent: { requestId: input.admissionRequestId, expectedVersion: input.expectedVersion, decision: input.decision, internalReason: input.internalReason, externalMessage: input.externalMessage, confirmed: input.confirmed } };
    return this.run(input, command, admissionTransitionResultSchema, async (database, ledgerId) => {
      const request = await this.request(database, input.tribeId, input.admissionRequestId);
      if (!request) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      return this.decideInTransaction(database, input, ledgerId, request);
    }, input.admissionRequestId);
  }

  /** @param database - Current business transaction. @param input - Native reviewer and explicit decision. @param ledgerId - Original single or batch ledger. @param request - Locked original request. @param prepared - Actual locked batch facts and its transaction-local effects; individual decisions resolve their facts normally. @returns A confirmed proposal staged together with membership, audit and notice; the caller owns commit. */
  private async decideInTransaction(database: RequestDatabase, input: AdmissionDecisionIntent, ledgerId: string, request: AdmissionRequest, prepared?: AdmissionPreparedDecision) {
      if (input.decision === ADMISSION_DECISION.approve && request.source !== ADMISSION_REQUEST_SOURCE.common && request.source !== ADMISSION_REQUEST_SOURCE.personal && request.source !== ADMISSION_REQUEST_SOURCE.legacy) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
      const facts = { ...(prepared?.facts ?? await this.facts(database, input, request.contact, request.userId)), whatsappNumber: request.whatsappNumber ?? null };
      const actor = prepared?.actor ?? await new PostgresAdmissionAuthorizationReader(database, input.sessionId, ADMISSION_ACTION.decideRequest).getCurrentActor(input.tribeId, input.userId);
      if (!actor) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const requiresEvidence = input.decision === ADMISSION_DECISION.approve && (request.source === ADMISSION_REQUEST_SOURCE.personal || request.evidence.kind === ADMISSION_EVIDENCE_KIND.base || request.evidence.kind === ADMISSION_EVIDENCE_KIND.local || facts.policy?.mode === ADMISSION_POLICY_MODE.allowlist);
      const review = requiresEvidence ? await readAdmissionReviewEvidence(database, input, request, await this.readSecurityConfig()) : { ...facts, request: { id: request.id, userId: request.userId, expiresAt: request.expiresAt, source: facts.source, attachedEvidence: null }, reviewer: actor };
      const proposal = proposeAdmissionDecision({ request, expectedVersion: input.expectedVersion, decisionId: randomUUID(), decision: input.decision, actor, review, internalReason: input.internalReason, externalMessage: input.externalMessage, now: await databaseNow(database) });
      if (!proposal.allowed) throw new AdmissionOperationError(proposal.code);
      const effectId = proposal.membershipEffect ? randomUUID() : null;
      const decision = proposal.decision;
      await database.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,internal_reason,external_message,decided_at,membership_effect_id,evidence_snapshot) values (${decision.id},${decision.requestId},${decision.tribeId},${decision.userId},${decision.requestVersion},${decision.outcome},${decision.actorUserId},${decision.actorKind},${decision.rule},${decision.policyVersion},${decision.verificationEpoch},${decision.internalReason},${decision.externalMessage},${decision.decidedAt},${effectId},${JSON.stringify(decision.evidenceSnapshot)}::jsonb)`);
      await this.transition(database, request, proposal.request);
      if (effectId) {
        const applied = await this.compose(database).memberships.apply({ tribeId: input.tribeId, userId: request.userId, decisionId: decision.id });
        if (applied.status !== TRIBE_FREE_JOIN_STATUS.joined) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
      }
      await this.record(database, input, proposal.request, ledgerId, decision.outcome, request, decision, prepared?.effects);
      return { admissionRequestId: request.id, version: proposal.request.version, status: proposal.request.status };
  }

  /** @param database - Exact claim or business transaction. @param scope - Native human identity. @param registrationOnly - Claim phases retain shared scope locks. @returns Whether the current active leader or guardian may process a selected batch. */
  private async authorizeBatch(database: RequestDatabase, scope: AdmissionCommandScope, registrationOnly = false): Promise<boolean> {
    await this.authorize(database, scope, ADMISSION_BATCH_DECISION_OPERATION, undefined, registrationOnly);
    const actor = await new PostgresAdmissionAuthorizationReader(database, scope.sessionId, ADMISSION_ACTION.readInbox).getCurrentActor(scope.tribeId, scope.userId);
    return Boolean(actor && actor.status === TRIBE_MEMBERSHIP_STATUS.active && (actor.role === TRIBE_MEMBER_ROLE.leader || actor.role === TRIBE_MEMBER_ROLE.guardian));
  }

  /** @param database - Authorized original business transaction. @param input - Exact explicit selection. @returns Current scope and applicant facts read once under shared locks; each row still reads its locked request and fresh clock before proposing. */
  private async readBatchFacts(database: RequestDatabase, input: AdmissionBatchDecisionIntent): Promise<AdmissionBatchFacts> {
    const identities = (await database.execute<{ user_id: string }>(sql`select user_id from public.academy_admission_requests where tribe_id=${input.tribeId} and id=any(${sql.param(input.items.map((item) => item.admissionRequestId))}::uuid[])`)).rows;
    const applicantIds = [...new Set(identities.map((request) => request.user_id))].sort();
    const tribe = (await database.execute<{ activated_at: string | null; access_model: string; admission_enabled: boolean }>(sql`select tribe.admissions_control_activated_at as activated_at,settings.access_model,settings.admission_enabled from public.tribes tribe inner join public.tribe_academy_settings settings on settings.tribe_id=tribe.id where tribe.id=${input.tribeId} for share of settings`)).rows[0];
    const policy = await this.policy(database, input.tribeId);
    const members = (await database.execute<AdmissionMembershipFacts>(sql`select user_id as "userId",tribe_id as "tribeId",role,status,status_reason as "statusReason",commercial_recovery_status as "commercialRecoveryStatus" from public.tribe_members where tribe_id=${input.tribeId} and user_id=any(${sql.param(applicantIds)}::text[]) order by user_id for share`)).rows;
    const accounts = (await database.execute<{ id: string; email: string }>(sql`select id,email from public."user" where id=any(${sql.param(applicantIds)}::text[]) order by id for share`)).rows;
    const actor = await new PostgresAdmissionAuthorizationReader(database, input.sessionId, ADMISSION_ACTION.readInbox).getCurrentActor(input.tribeId, input.userId);
    if (!actor) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    if (actor.status !== TRIBE_MEMBERSHIP_STATUS.active || actor.role !== TRIBE_MEMBER_ROLE.leader && actor.role !== TRIBE_MEMBER_ROLE.guardian) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
    const config = await this.readSecurityConfig(), now = await databaseNow(database);
    const membersByApplicant = new Map(members.map((member) => [member.userId, member]));
    const accountsById = new Map(accounts.map((account) => [account.id, account]));
    return { actor, byApplicant: new Map(applicantIds.map((applicantId) => {
      const account = accountsById.get(applicantId);
      const facts: AdmissionSubmissionFacts = {
        now, tribe: { id: input.tribeId, isAcademy: tribe?.access_model === TRIBE_ACCESS_MODEL.academy, controlActivated: Boolean(tribe?.activated_at), evaluatorEnabled: Boolean(tribe?.admission_enabled), recoveryLocked: config.recoveryLocked }, policy,
        account: account ? { userId: applicantId, normalizedEmail: account.email.trim().toLowerCase(), googleAccount: null } : null,
        contact: null, source: { kind: ADMISSION_REQUEST_SOURCE.common }, membership: membersByApplicant.get(applicantId) ?? null,
        baseEvidence: null, localProof: null, currentConnection: null, contactBinding: null, allowlistEntry: null,
      };
      return [applicantId, facts];
    })) };
  }

  /** @param database - The batch's original transaction. @param ledgerId - One durable original identity. @param input - One explicitly selected version and the common decision. @param lockedFacts - Current scope and applicant facts pinned by this business transaction. @param effects - Immutable notices and audit facts flushed before completing the same ledger. @returns An expected row outcome; unexpected failures escape and roll back the complete business transaction. */
  private async decideBatchItem(database: RequestDatabase, ledgerId: string, input: AdmissionDecisionIntent, lockedFacts: AdmissionBatchFacts, effects: AdmissionBatchEffects): Promise<AdmissionBatchDecisionItemResult> {
    await database.execute(sql.raw(ADMISSION_COMMAND_EFFECT_SQL.begin));
    try {
      const request = await this.request(database, input.tribeId, input.admissionRequestId);
      if (!request) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      if (request.userId === input.userId) {
        await database.execute(sql.raw(ADMISSION_COMMAND_EFFECT_SQL.release));
        return { admissionRequestId: input.admissionRequestId, status: ADMISSION_BATCH_ITEM_STATUS.denied, code: ADMISSION_ERROR_CODE.permissionDenied };
      }
      const facts = lockedFacts.byApplicant.get(request.userId);
      if (!facts) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const result = await this.decideInTransaction(database, input, ledgerId, request, { actor: lockedFacts.actor, facts: { ...facts, contact: request.contact }, effects });
      await database.execute(sql.raw(ADMISSION_COMMAND_EFFECT_SQL.release));
      return result;
    } catch (error) {
      const denial = error instanceof AdmissionOperationError ? admissionCommandDenialSchema.safeParse({ outcome: ADMISSION_OUTCOME.denied, code: error.code, admissionRequestId: input.admissionRequestId }) : null;
      if (!denial?.success) throw error;
      await database.execute(sql.raw(ADMISSION_COMMAND_EFFECT_SQL.rollback));
      await database.execute(sql.raw(ADMISSION_COMMAND_EFFECT_SQL.release));
      return {
        admissionRequestId: input.admissionRequestId,
        status: denial.data.code === ADMISSION_ERROR_CODE.requestConflict || denial.data.code === ADMISSION_ERROR_CODE.policyConflict ? ADMISSION_BATCH_ITEM_STATUS.conflict : ADMISSION_BATCH_ITEM_STATUS.denied,
        code: denial.data.code,
      };
    }
  }

  /** @param input - Explicit bounded selection, original versions, confirmation and separate messages. @returns The original committed row outcomes or genuine registered progress; no external operation or independently committed row is introduced. */
  async decideBatch(input: AdmissionBatchDecisionIntent): Promise<AdmissionOperationResult<AdmissionBatchDecisionSnapshot>> {
    const intent = { ...input, internalReason: input.internalReason.trim(), externalMessage: input.externalMessage?.trim() || null, items: input.items.map((item) => ({ ...item })) };
    const command = {
      actorUserId: intent.userId, tribeId: intent.tribeId, operationType: ADMISSION_BATCH_DECISION_OPERATION, idempotencyKey: intent.operationId,
      intent: {
        context: { decision: intent.decision, internalReason: intent.internalReason, externalMessage: intent.externalMessage, confirmed: intent.confirmed },
        items: intent.items.map((item) => ({ resourceId: item.admissionRequestId, expectedVersion: item.expectedVersion, intent: null })),
      },
    };
    const ledger = new PostgresAdmissionOperationRepository((run) => this.execute(intent, run), (database) => this.authorizeBatch(database, intent), this.readSecurityConfig, (database) => this.authorizeBatch(database, intent, true));
    let lockedFacts: AdmissionBatchFacts | undefined;
    let processedItems = 0;
    const effects: AdmissionBatchEffects = { notifications: [], audit: [] };
    try {
      return await ledger.runBatch(command, admissionBatchDecisionSnapshotSchema, async (database, ledgerId, item) => {
        lockedFacts ??= await this.readBatchFacts(database, intent);
        const result = await this.decideBatchItem(database, ledgerId, { ...intent, type: ADMISSION_OPERATION_TYPE.decide, admissionRequestId: item.resourceId, expectedVersion: item.expectedVersion }, lockedFacts, effects);
        processedItems += 1;
        if (processedItems === intent.items.length) {
          await this.compose(database).notifications.recordMany(effects.notifications);
          await new PostgresAdmissionAuditRepository(database).appendMany(effects.audit);
        }
        return result;
      });
    } catch (error) {
      if (!(error instanceof AdmissionOperationError) || error.code !== ADMISSION_ERROR_CODE.operationUnresolved) throw error;
      try {
        const original = await ledger.readBatch(command, admissionBatchDecisionSnapshotSchema);
        if (original?.state === OPERATION_STATE.completed) return original;
      } catch (reconciliationError) {
        if (reconciliationError instanceof AdmissionOperationError) throw reconciliationError;
        throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: intent.operationId, cause: new AggregateError([error, reconciliationError], "Admission batch original operation reconciliation failed", { cause: error }) });
      }
      throw error;
    }
  }

  /** Owner cancellation remains available during pause and never reopens a consumed source. */
  async cancel(input: AdmissionCancellationIntent) {
    const command = { actorUserId: input.userId, tribeId: input.tribeId, operationType: ADMISSION_OPERATION_TYPE.cancel, idempotencyKey: input.operationId, intent: { requestId: input.admissionRequestId, expectedVersion: input.expectedVersion, internalReason: input.internalReason, confirmed: input.confirmed } };
    return this.run(input, command, admissionTransitionResultSchema, async (database, ledgerId) => {
      const request = await this.request(database, input.tribeId, input.admissionRequestId);
      if (!request) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const actor: AdmissionActorFacts | null = await new PostgresAdmissionAuthorizationReader(database, input.sessionId, ADMISSION_ACTION.cancelOwnRequest).getCurrentActor(input.tribeId, input.userId);
      if (!actor) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const proposal = proposeAdmissionCancellation({ request, expectedVersion: input.expectedVersion, decisionId: randomUUID(), actor, internalReason: input.internalReason, now: await databaseNow(database) });
      if (!proposal.allowed) throw new AdmissionOperationError(proposal.code);
      const policy = await this.policy(database, input.tribeId);
      const decision:AdmissionRequestAuditDecision={id:proposal.request.decisionId,rule:proposal.rule,policyVersion:policy?.version??request.originalPolicy.version,verificationEpoch:policy?.verificationEpoch??request.originalPolicy.verificationEpoch,decidedAt:proposal.request.resolvedAt};
      await database.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,internal_reason,evidence_snapshot,decided_at) values (${decision.id},${request.id},${request.tribeId},${request.userId},${request.version},${ADMISSION_REQUEST_STATUS.cancelled},${actor.userId},${ADMISSION_DECISION_ACTOR_KIND.user},${decision.rule},${decision.policyVersion},${decision.verificationEpoch},${proposal.internalReason},${JSON.stringify(snapshotAdmissionDecisionEvidence(request.evidence))}::jsonb,${decision.decidedAt})`);
      await this.transition(database, request, proposal.request);
      await this.record(database, input, proposal.request, ledgerId, ADMISSION_REQUEST_EVENT.cancelled, request, decision);
      return { admissionRequestId: request.id, version: proposal.request.version, status: proposal.request.status };
    }, input.admissionRequestId);
  }

  /** Advances only a current terminal request's retry metadata, audit and original ledger result. */
  async allowRetry(input: AdmissionRetryIntent) {
    const command = { actorUserId: input.userId, tribeId: input.tribeId, operationType: ADMISSION_OPERATION_TYPE.allowRetry, idempotencyKey: input.operationId, intent: { requestId: input.admissionRequestId, expectedVersion: input.expectedVersion, internalReason: input.internalReason, confirmed: input.confirmed } };
    return this.run(input, command, admissionRetryResultSchema, async (database, ledgerId) => {
      const request = await this.request(database, input.tribeId, input.admissionRequestId);
      if (!request) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const actor = await new PostgresAdmissionAuthorizationReader(database, input.sessionId, ADMISSION_ACTION.allowEarlyRetry).getCurrentActor(input.tribeId, input.userId);
      if (!actor) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const proposal = proposeAdmissionRetry({ request, actor, expectedVersion: input.expectedVersion, internalReason: input.internalReason, now: await databaseNow(database) });
      if (!proposal.allowed) throw new AdmissionOperationError(proposal.code);
      if (proposal.changed) {
        const updated = (await database.execute(sql`update public.academy_admission_requests set retry_allowed_at=${proposal.retryAllowedAt},version=${proposal.request.version} where id=${request.id} and tribe_id=${request.tribeId} and user_id=${request.userId} and status=${request.status} and version=${request.version} returning id`)).rows[0];
        if (!updated) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
        await new PostgresAdmissionAuditRepository(database).append(createAdmissionRetryAuditEvent({actorUserId:input.userId,operationId:ledgerId,request:proposal.request,previous:request,internalReason:proposal.internalReason,retryAllowedAt:proposal.retryAllowedAt}));
      }
      return { admissionRequestId: request.id, version: proposal.request.version, retryAllowedAt: proposal.retryAllowedAt.toISOString() };
    }, input.admissionRequestId);
  }

  /** CAS and authoritative expiry are checked in the actual UPDATE, not only in a pre-lock proposal. */
  private async transition(database: RequestDatabase, original: AdmissionRequest, proposed: AdmissionRequest): Promise<void> {
    const updated = (await database.execute(sql`update public.academy_admission_requests set status=${proposed.status},version=${proposed.version},decision_id=${proposed.decisionId},cancel_reason=${proposed.cancelReason} where id=${original.id} and tribe_id=${original.tribeId} and user_id=${original.userId} and status=${ADMISSION_REQUEST_STATUS.pending} and version=${original.version} and expires_at>clock_timestamp() returning id`)).rows[0];
    if (!updated) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
  }

  /** Expiration is decided after the request lock even if the scheduled sweep has not materialized it. */
  private async expire(database: RequestDatabase, scope: AdmissionCommandScope, request: AdmissionRequest, ledgerId: string, policy: AdmissionPolicy | null): Promise<void> {
    const decisionId = randomUUID();
    const decision:AdmissionRequestAuditDecision={id:decisionId,rule:ADMISSION_DECISION_RULE.expired,policyVersion:policy?.version??request.originalPolicy.version,verificationEpoch:policy?.verificationEpoch??request.originalPolicy.verificationEpoch,decidedAt:await databaseNow(database)};
    await database.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_kind,rule,policy_version,verification_epoch,evidence_snapshot,decided_at) values (${decision.id},${request.id},${request.tribeId},${request.userId},${request.version},${ADMISSION_REQUEST_STATUS.expired},${ADMISSION_DECISION_ACTOR_KIND.system},${decision.rule},${decision.policyVersion},${decision.verificationEpoch},${JSON.stringify(snapshotAdmissionDecisionEvidence(request.evidence))}::jsonb,${decision.decidedAt})`);
    const updated = (await database.execute(sql`update public.academy_admission_requests set status=${ADMISSION_REQUEST_STATUS.expired},decision_id=${decisionId},version=version+1 where id=${request.id} and tribe_id=${request.tribeId} and user_id=${request.userId} and status=${ADMISSION_REQUEST_STATUS.pending} and version=${request.version} and expires_at<=clock_timestamp() returning id`)).rows[0];
    if (!updated) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
    await this.record(database, scope, { ...request, version: request.version + 1, status: ADMISSION_REQUEST_STATUS.expired, decisionId, resolvedAt:decision.decidedAt }, ledgerId, ADMISSION_REQUEST_EVENT.expired, request, decision);
  }
}
