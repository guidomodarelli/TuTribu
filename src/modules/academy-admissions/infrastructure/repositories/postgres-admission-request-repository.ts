/** Owns manual request effects and their original ledger result inside protected SQL transactions. @module postgres-admission-request-repository */
import { snapshotAdmissionDecisionEvidence } from "@/src/modules/academy-admissions/domain/value-objects/admission-decision-evidence";
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
import { PostgresAdmissionAuthorizationReader } from "./postgres-admission-authorization-reader";
import { PostgresAdmissionOperationRepository } from "./postgres-admission-operation-repository";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { admissionCommittedOutcomeSchema, admissionTransitionResultSchema, admissionRetryResultSchema, type AdmissionSubmissionResult } from "@/src/modules/academy-admissions/application/results/admission-writer-result-schemas";
import { PostgresOwnAdmissionRequestReader } from "./postgres-own-admission-request-reader";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_ACTION, ADMISSION_DENIAL_REASON, ADMISSION_EVIDENCE_KIND, ADMISSION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_REQUEST_STATUS, ADMISSION_REQUEST_SOURCE, ADMISSION_OPERATION_TYPE, ADMISSION_REQUEST_EVENT } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_RESOURCE_KIND } from "@/src/modules/academy-admissions/constants/admission-authorization";
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
import { ADMISSION_RETRY_AUDIT } from "@/src/modules/academy-admissions/constants/admission-decision";
import type { AdmissionExecutionCapabilitiesReader, AdmissionExecutionCapabilities } from "../../domain/repositories/admission-execution-capabilities";
import { MANUAL_ADMISSION_EXECUTION_CAPABILITIES } from "../../constants/admission-execution-capabilities";
import { PostgresAdmissionSubmissionProofReader } from "./postgres-admission-submission-proof-reader";
import { PostgresAdmissionVerificationProofWriter } from "./postgres-admission-verification-proof-writer";
import { ADMISSION_PROOF_APPLICATION_OUTCOME } from "../../constants/admission-proof";
import { ADMISSION_POLICY_MODE } from "../../constants/admission-policy";
import { readAllowlistAdmissionFacts } from "./postgres-allowlist-admission-facts";
import { bindBaseAdmissionContact } from "./postgres-base-admission-binding";
import { proposeAutomaticAdmissionDecision, type AutomaticAdmissionFacts } from "../../domain/entities/automatic-admission-decision";
import { readAdmissionReviewEvidence } from "./postgres-admission-review-evidence";

/** Every checkout reuses the trusted request actor; a client cannot select the database principal. */
type AdmissionDatabaseExecutor = <Result>(scope: AdmissionCommandScope, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Related owners are composed onto the same original transaction, with no provider work. */
type AdmissionTransactionCollaborators = { memberships: AcademyApprovedMembershipWriter; notifications: AdmissionNotificationObligationWriter };
/** Owned row fields are consumed directly; this is not a schema for a PostgreSQL response. */
type RequestRow = {
  id: string; tribe_id: string; user_id: string; source: AdmissionRequest["source"]; invitation_id: string | null; legacy_invitation_id: string | null;
  contact_type: "email" | "phone" | null; normalized_contact: string | null; evidence_source: "none" | "declared" | "base" | "local";
  proof_id: string | null; binding_id: string | null; requires_allowlist: boolean; original_policy_snapshot: AdmissionRequest["originalPolicy"];
  applicant_message: string | null; status: AdmissionRequest["status"]; submitted_at: string; expires_at: string; version: number;
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
export class PostgresAdmissionRequestRepository implements AdmissionCommandWriter<AdmissionSubmissionResult>, AdmissionRetryWriter, AdmissionExecutionCapabilitiesReader {
  /** @param execute - Guarded actual actor executor. @param readSecurityConfig - Live local platform keyrings/recovery state. @param compose - Explicit DB-only membership and notification owners. */
  constructor(private readonly execute: AdmissionDatabaseExecutor, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>, private readonly compose: (database: RequestDatabase) => AdmissionTransactionCollaborators) {}

  /** @returns The common manual/list profile consumed by submission guards; personal/legacy keep complete cutover closed. */
  getCapabilities(): AdmissionExecutionCapabilities {
    return { sources: [...MANUAL_ADMISSION_EXECUTION_CAPABILITIES.sources], policyModes: [...MANUAL_ADMISSION_EXECUTION_CAPABILITIES.policyModes], additionalVerification: MANUAL_ADMISSION_EXECUTION_CAPABILITIES.additionalVerification };
  }

  /** Locks the tribe first and rechecks actual session/current role before every ledger phase or replay. */
  private async authorize(database: RequestDatabase, scope: AdmissionCommandScope, operation: string, requestId?: string): Promise<boolean> {
    if (!(await database.execute(sql`select id from public.tribes where id=${scope.tribeId} for update`)).rows[0]) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    await database.execute(sql`select id from public."user" where id=${scope.userId} for share`);
    const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: scope.userId, sessionId: scope.sessionId }), (_identity, run) => run(database));
    if (!await accounts.getAuthenticatedAccount()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    const actor = await new PostgresAdmissionAuthorizationReader(database, scope.sessionId, ADMISSION_ACTION.readOwnRequest).getCurrentActor(scope.tribeId, scope.userId);
    if (!actor) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    if (!requestId) return true;
    const request = (await database.execute<{ user_id: string }>(sql`select user_id from public.academy_admission_requests where id=${requestId} and tribe_id=${scope.tribeId}`)).rows[0];
    if (!request) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    const reviewer = actor.status === TRIBE_MEMBERSHIP_STATUS.active && (actor.role === TRIBE_MEMBER_ROLE.leader || actor.role === TRIBE_MEMBER_ROLE.guardian);
    if (operation === ADMISSION_OPERATION_TYPE.decide) return reviewer && request.user_id !== scope.userId;
    if (operation === ADMISSION_OPERATION_TYPE.allowRetry) {
      if (actor.role !== TRIBE_MEMBER_ROLE.leader || actor.status !== TRIBE_MEMBERSHIP_STATUS.active) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
      await database.execute(sql`select intent_id from public.recent_authentication_evidence where user_id=${scope.userId} and session_id=${scope.sessionId} and tribe_id=${scope.tribeId} and operation=${REAUTHENTICATION_OPERATION.advanceAdmissionRetry} and resource_id=${requestId} for share`);
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
    const row = (await database.execute<AdmissionPolicy>(sql`select tribe_id as id,tribe_id as "tribeId",mode,contact_type as "contactType",is_open as "isOpen",allow_common_exceptions as "allowCommonExceptions",requires_additional_verification as "requiresAdditionalVerification",phone_channel as "phoneChannel",allow_sms_alternative as "allowSmsAlternative",messaging_connection_id as "messagingConnectionId",messaging_connection_version as "messagingConnectionVersion",verification_epoch as "verificationEpoch",version,activated_at as "activatedAt" from public.academy_admission_policies where tribe_id=${tribeId} for share`)).rows[0];
    return row ? { ...row, activatedAt: row.activatedAt ? new Date(row.activatedAt) : null } : null;
  }

  /** Current membership facts retain role, moderation and the actual known commercial snapshot. */
  private async membership(database: RequestDatabase, tribeId: string, userId: string): Promise<AdmissionMembershipFacts | null> {
    return (await database.execute<AdmissionMembershipFacts>(sql`select tribe_id as "tribeId",user_id as "userId",role,status,status_reason as "statusReason",commercial_recovery_status as "commercialRecoveryStatus" from public.tribe_members where tribe_id=${tribeId} and user_id=${userId} for share`)).rows[0] ?? null;
  }

  /** Reads original provenance for every terminal action; approval authority remains a separate current evaluation. */
  private async request(database: RequestDatabase, tribeId: string, requestId?: string, userId?: string): Promise<AdmissionRequest | null> {
    const row = (await database.execute<RequestRow>(sql`select request.id,request.tribe_id,request.user_id,request.source,request.invitation_id,request.legacy_invitation_id,request.contact_type,request.normalized_contact,request.evidence_source,request.proof_id,request.binding_id,request.requires_allowlist,request.original_policy_snapshot,request.applicant_message,request.status,request.submitted_at,request.expires_at,request.version,request.decision_id,request.cancel_reason,request.retry_allowed_at,request.global_identity_evidence_id,(select decided_at from public.academy_admission_decisions where id=request.decision_id) as resolved_at,case when request.evidence_source=${ADMISSION_EVIDENCE_KIND.local} then (select verified_at from public.academy_admission_verification_proofs where id=request.proof_id) when request.evidence_source=${ADMISSION_EVIDENCE_KIND.base} then (select verified_at from public.global_identity_evidence where id=request.global_identity_evidence_id) end as evidence_verified_at from public.academy_admission_requests request where request.tribe_id=${tribeId} ${requestId ? sql`and request.id=${requestId}` : sql`and request.user_id=${userId} order by request.submitted_at desc,request.id desc limit 1`} for update of request`)).rows[0];
    if (!row) return null;
    const contact = row.contact_type === ADMISSION_CONTACT_TYPE.email && row.normalized_contact ? { type: ADMISSION_CONTACT_TYPE.email, value: row.normalized_contact }
      : row.contact_type === ADMISSION_CONTACT_TYPE.phone && row.normalized_contact ? { type: ADMISSION_CONTACT_TYPE.phone, value: row.normalized_contact, country: parsePhoneNumber(row.normalized_contact).country ?? "" } : null;
    return { id: row.id, tribeId: row.tribe_id, userId: row.user_id, source: row.source, invitationId: row.invitation_id, legacyInvitationId: row.legacy_invitation_id, requiresAllowlist: row.requires_allowlist, contact, evidence: requestEvidence(row), bindingId: row.binding_id, proofId: row.proof_id, originalPolicy: row.original_policy_snapshot, applicantMessage: row.applicant_message, status: row.status, submittedAt: new Date(row.submitted_at), expiresAt: new Date(row.expires_at), version: row.version, decisionId: row.decision_id, cancelReason: row.cancel_reason, resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null, retryAllowedAt: row.retry_allowed_at ? new Date(row.retry_allowed_at) : null };
  }

  /** Own current facts are resolved after locks; no sender or external key can participate. */
  private async facts(database: RequestDatabase, scope: AdmissionCommandScope, contact: AdmissionSubmissionFacts["contact"], applicantId = scope.userId): Promise<AdmissionSubmissionFacts> {
    const tribe = (await database.execute<{ activated_at: string | null; access_model: string; admission_enabled: boolean }>(sql`select tribe.admissions_control_activated_at as activated_at,settings.access_model,settings.admission_enabled from public.tribes tribe inner join public.tribe_academy_settings settings on settings.tribe_id=tribe.id where tribe.id=${scope.tribeId} for share of settings`)).rows[0];
    const policy = await this.policy(database, scope.tribeId), membership = await this.membership(database, scope.tribeId, applicantId);
    const account = (await database.execute<{ email: string }>(sql`select email from public."user" where id=${applicantId} for share`)).rows[0];
    const config = await this.readSecurityConfig(), now = await databaseNow(database);
    return { now, tribe: { id: scope.tribeId, isAcademy: tribe?.access_model === TRIBE_ACCESS_MODEL.academy, controlActivated: Boolean(tribe?.activated_at), evaluatorEnabled: Boolean(tribe?.admission_enabled), recoveryLocked: config.recoveryLocked }, policy,
      account: account ? { userId: applicantId, normalizedEmail: account.email.trim().toLowerCase(), googleAccount: null } : null,
      contact, source: { kind: ADMISSION_REQUEST_SOURCE.common }, membership, baseEvidence: null, localProof: null, currentConnection: null, contactBinding: null, allowlistEntry: null };
  }

  /** Recovers an original committed result after possible COMMIT response loss without repeating the write. */
  private async run<Result>(scope: AdmissionCommandScope, command: AdmissionOperationCommand, schema: z.ZodType<Result>, mutate: (database: RequestDatabase, ledgerId: string) => Promise<Result>, requestId?: string): Promise<AdmissionOperationResult<Result>> {
    const ledger = new PostgresAdmissionOperationRepository((work) => this.execute(scope, work), (database) => this.authorize(database, scope, command.operationType, requestId), this.readSecurityConfig);
    try { return await ledger.run(command, schema, mutate); }
    catch (error) {
      if (error instanceof AdmissionOperationError && error.code === ADMISSION_ERROR_CODE.operationUnresolved) {
        try { const result = await ledger.read(command, schema); if (result?.state === OPERATION_STATE.completed) return result; }
        catch (reconciliationError) {
          if (reconciliationError instanceof AdmissionOperationError) throw reconciliationError;
          throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: command.idempotencyKey, cause: new AggregateError([error, reconciliationError], "Manual admission original operation reconciliation failed", { cause: error }) });
        }
      }
      throw error;
    }
  }

  /** Records notice/audit before the same transaction can publish its own minimal result. */
  private async record(database: RequestDatabase, scope: AdmissionCommandScope, request: AdmissionRequest, ledgerId: string, event: Parameters<AdmissionNotificationObligationWriter["record"]>[0]["event"], rule?: string): Promise<void> {
    await this.compose(database).notifications.record({ id: randomUUID(), tribeId: scope.tribeId, admissionRequestId: request.id, applicantUserId: request.userId, event });
    await database.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,resource_version) values (${scope.tribeId},${scope.userId},${ADMISSION_RESOURCE_KIND.request},${request.id},${ledgerId},${event},${rule ?? null},${request.version})`);
  }

  /** Submits a current common manual request with declared or owned local evidence; existing membership/pending precedes new proof effects. */
  async submit(input: AdmissionSubmissionIntent) {
    const command = { actorUserId: input.userId, tribeId: input.tribeId, operationType: ADMISSION_OPERATION_TYPE.submit, idempotencyKey: input.operationId, intent: { expectedPolicyVersion: input.expectedPolicyVersion, source: input.source, contact: input.contact, proofId: input.proofId, message: input.message, confirmed: input.confirmed } };
    return this.run(input, command, admissionCommittedOutcomeSchema, async (database, ledgerId): Promise<AdmissionSubmissionResult> => {
      const facts: AutomaticAdmissionFacts = { ...await this.facts(database, input, input.contact), allowlistEntry: null, baseEvidence: null };
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
      if (facts.policy.mode === ADMISSION_POLICY_MODE.allowlist) Object.assign(facts, await readAllowlistAdmissionFacts(database, input, facts.contact));
      const local = facts.policy.requiresAdditionalVerification && input.proofId ? await new PostgresAdmissionSubmissionProofReader(database, this.readSecurityConfig).read(input, input.proofId, facts) : null;
      if (facts.policy.requiresAdditionalVerification && input.proofId && !local) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.proofUnavailable);
      if (local) { facts.localProof = local.proof; facts.currentConnection = local.currentConnection; facts.contactBinding = local.contactBinding; }
      facts.now = await databaseNow(database);
      const eligibility = evaluateAdmissionSubmission(facts);
      if (eligibility.outcome === ADMISSION_OUTCOME.verificationRequired) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.additionalVerificationRequired);
      if (eligibility.outcome === ADMISSION_OUTCOME.denied && eligibility.reason === ADMISSION_DENIAL_REASON.contactConflict) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.contactBindingConflict);
      if (eligibility.outcome !== ADMISSION_OUTCOME.pending && eligibility.outcome !== ADMISSION_OUTCOME.admitted) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
      if (eligibility.outcome === ADMISSION_OUTCOME.pending && eligibility.requiresExceptionReason && !input.message?.trim()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
      const request = createPendingAdmissionRequest({ id: randomUUID(), tribeId: input.tribeId, userId: input.userId, source: ADMISSION_REQUEST_SOURCE.common, contact: facts.contact, evidence: { kind: eligibility.evidenceKind === ADMISSION_EVIDENCE_KIND.none ? ADMISSION_EVIDENCE_KIND.none : ADMISSION_EVIDENCE_KIND.declared }, policy: facts.policy, message: input.message, now: await databaseNow(database) });
      await database.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,applicant_message,submitted_at,expires_at) values (${request.id},${request.tribeId},${request.userId},${request.source},${request.contact?.type ?? null},${request.contact?.value ?? null},${request.evidence.kind},${JSON.stringify(request.originalPolicy)}::jsonb,${request.applicantMessage},${request.submittedAt},${request.expiresAt})`);
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
      if (eligibility.outcome === ADMISSION_OUTCOME.admitted) return this.approveAutomatic(database, input, committed, facts, ledgerId);
      await this.record(database, input, committed, ledgerId, ADMISSION_REQUEST_EVENT.pendingCreated);
      return this.pendingResult(database, input, committed, true);
    });
  }

  /** @param database - Original protected submission transaction. @param input - Actual applicant and original operation. @param request - Bound own request/evidence already staged. @param facts - Current private exact match and policy. @param ledgerId - Same original ledger. @returns Minimal committed automatic result; no pending reviewer notice is created. */
  private async approveAutomatic(database: RequestDatabase, input: AdmissionSubmissionIntent, request: AdmissionRequest, facts: AutomaticAdmissionFacts, ledgerId: string): Promise<AdmissionSubmissionResult> {
    const proposal = proposeAutomaticAdmissionDecision({ facts, request, decisionId: randomUUID(), now: await databaseNow(database) });
    if (!proposal.allowed) throw new AdmissionOperationError(proposal.code);
    const decision = proposal.decision, effectId = randomUUID();
    await database.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,decided_at,membership_effect_id,evidence_snapshot,allowlist_entry_id,allowlist_entry_version) values (${decision.id},${request.id},${input.tribeId},${input.userId},${request.version},${decision.outcome},${decision.actorUserId},${decision.actorKind},${decision.rule},${decision.policyVersion},${decision.verificationEpoch},${decision.decidedAt},${effectId},${JSON.stringify(decision.evidenceSnapshot)}::jsonb,${proposal.authorization.entryId},${proposal.authorization.version})`);
    await this.transition(database, request, proposal.request);
    const applied = await this.compose(database).memberships.apply({ tribeId: input.tribeId, userId: input.userId, decisionId: decision.id });
    if (applied.status !== TRIBE_FREE_JOIN_STATUS.joined) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
    await this.record(database, input, proposal.request, ledgerId, ADMISSION_REQUEST_EVENT.approved, decision.rule);
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
    await this.record(database, scope, proposal.request, ledgerId, ADMISSION_REQUEST_EVENT.cancelled, decision.rule);
  }

  /** Captures the own committed response inside the original transaction; replay never substitutes a current state. */
  private async pendingResult(database: RequestDatabase, input: AdmissionSubmissionIntent, request: AdmissionRequest, created: boolean): Promise<AdmissionSubmissionResult> {
    const snapshot = await new PostgresOwnAdmissionRequestReader((_scope, run) => run(database)).readOwn(input);
    if (!snapshot || snapshot.id !== request.id || snapshot.status !== ADMISSION_REQUEST_STATUS.pending || snapshot.version !== request.version) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
    return { operationId: input.operationId, outcome: ADMISSION_OUTCOME.pending, admissionRequestId: request.id, committedRequestVersion: request.version, membership: null, requestSnapshot: { ...snapshot, status: ADMISSION_REQUEST_STATUS.pending }, created };
  }

  /** Writes exactly one terminal decision and its basic effect/obligations before completion. */
  async decide(input: AdmissionDecisionIntent) {
    const command = { actorUserId: input.userId, tribeId: input.tribeId, operationType: ADMISSION_OPERATION_TYPE.decide, idempotencyKey: input.operationId, intent: { requestId: input.admissionRequestId, expectedVersion: input.expectedVersion, decision: input.decision, internalReason: input.internalReason, externalMessage: input.externalMessage, confirmed: input.confirmed } };
    return this.run(input, command, admissionTransitionResultSchema, async (database, ledgerId) => {
      const request = await this.request(database, input.tribeId, input.admissionRequestId);
      if (!request) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      if (input.decision === ADMISSION_DECISION.approve && request.source !== ADMISSION_REQUEST_SOURCE.common) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
      const facts = await this.facts(database, input, request.contact, request.userId);
      const actor = await new PostgresAdmissionAuthorizationReader(database, input.sessionId, ADMISSION_ACTION.decideRequest).getCurrentActor(input.tribeId, input.userId);
      if (!actor) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
      const requiresEvidence = input.decision === ADMISSION_DECISION.approve && (request.evidence.kind === ADMISSION_EVIDENCE_KIND.base || request.evidence.kind === ADMISSION_EVIDENCE_KIND.local || facts.policy?.mode === ADMISSION_POLICY_MODE.allowlist);
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
      await this.record(database, input, proposal.request, ledgerId, decision.outcome, decision.rule);
      return { admissionRequestId: request.id, version: proposal.request.version, status: proposal.request.status };
    }, input.admissionRequestId);
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
      await database.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,internal_reason,evidence_snapshot) values (${proposal.request.decisionId},${request.id},${request.tribeId},${request.userId},${request.version},${ADMISSION_REQUEST_STATUS.cancelled},${actor.userId},${ADMISSION_DECISION_ACTOR_KIND.user},${proposal.rule},${policy?.version ?? request.originalPolicy.version},${policy?.verificationEpoch ?? request.originalPolicy.verificationEpoch},${proposal.internalReason},${JSON.stringify(snapshotAdmissionDecisionEvidence(request.evidence))}::jsonb)`);
      await this.transition(database, request, proposal.request);
      await this.record(database, input, proposal.request, ledgerId, ADMISSION_REQUEST_EVENT.cancelled, proposal.rule);
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
        await database.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,resource_version,metadata) values (${input.tribeId},${input.userId},${ADMISSION_RESOURCE_KIND.request},${request.id},${ledgerId},${ADMISSION_RETRY_AUDIT.event},${ADMISSION_RETRY_AUDIT.rule},${proposal.request.version},${JSON.stringify({ internalReason: proposal.internalReason, previousVersion: request.version })}::jsonb)`);
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
    await database.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_kind,rule,policy_version,verification_epoch,evidence_snapshot) values (${decisionId},${request.id},${request.tribeId},${request.userId},${request.version},${ADMISSION_REQUEST_STATUS.expired},${ADMISSION_DECISION_ACTOR_KIND.system},${ADMISSION_DECISION_RULE.expired},${policy?.version ?? request.originalPolicy.version},${policy?.verificationEpoch ?? request.originalPolicy.verificationEpoch},${JSON.stringify(snapshotAdmissionDecisionEvidence(request.evidence))}::jsonb)`);
    const updated = (await database.execute(sql`update public.academy_admission_requests set status=${ADMISSION_REQUEST_STATUS.expired},decision_id=${decisionId},version=version+1 where id=${request.id} and tribe_id=${request.tribeId} and user_id=${request.userId} and status=${ADMISSION_REQUEST_STATUS.pending} and version=${request.version} and expires_at<=clock_timestamp() returning id`)).rows[0];
    if (!updated) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.requestConflict);
    await this.record(database, scope, { ...request, version: request.version + 1, status: ADMISSION_REQUEST_STATUS.expired, decisionId }, ledgerId, ADMISSION_REQUEST_EVENT.expired, ADMISSION_DECISION_RULE.expired);
  }
}
