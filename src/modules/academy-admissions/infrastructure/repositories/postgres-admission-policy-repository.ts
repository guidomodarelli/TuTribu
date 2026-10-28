/** Commits explicit policy commands with current authority, original replay and resource CAS. @module postgres-admission-policy-repository */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import type { AdmissionPolicyCommandWriter, AdmissionPolicyInitializationIntent, AdmissionPolicyUpdateIntent, AdmissionPolicyActivationIntent, AdmissionPolicyPauseIntent, AdmissionPolicyMutationResult, AdmissionPolicyPreparationReader } from "../../domain/repositories/admission-policy-management";
import type { AdmissionOperationCommand, AdmissionOperationResult } from "../../domain/entities/admission-operation";
import { createDefaultAdmissionPolicy, proposeAdmissionPolicyChange, requiresAdmissionPolicyReadiness, selectAdmissionPolicyRules, type AdmissionPolicy, type AdmissionPolicyPatch, type AdmissionPolicyRulesPatch, type AdmissionPolicyConfigurationFacts } from "../../domain/entities/admission-policy";
import { proposeAdmissionPolicyActivation, type AdmissionPolicyActivationReason } from "../../domain/policies/admission-policy-activation";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { AdmissionPolicyRequirementError } from "../../domain/errors/admission-policy-requirement-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_POLICY_ACTIVATION_ERROR, ADMISSION_POLICY_AUDIT, ADMISSION_POLICY_CONFIGURATION_ERROR, ADMISSION_POLICY_EDITABLE_FIELDS, ADMISSION_POLICY_CHANGE_OUTCOME } from "../../constants/admission-policy";
import { ADMISSION_PROOF_STATUS, ADMISSION_VERIFICATION_PURPOSE } from "../../constants/admission-eligibility";
import { VERIFICATION_CHALLENGE_STATE } from "../../constants/verification-challenge";
import { REAUTHENTICATION_OPERATION, type ReauthenticationOperation } from "@/src/modules/auth/constants/reauthentication-resources";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { PostgresAdmissionOperationRepository } from "./postgres-admission-operation-repository";
import { admissionPolicyMutationResultSchema } from "../../application/results/admission-policy-result-schemas";
import { admissionPolicyDatabaseNow, authorizeAdmissionPolicy } from "./postgres-admission-policy-authorizer";
import { withReusedAdmissionLeaderAuthority } from "./postgres-admission-leader-authorizer";
import { readAdmissionPolicyWithControlMarker } from "./postgres-admission-policy-storage";
import { createAdmissionPolicyAuditEvent } from "../../domain/entities/admission-audit-event";
import { PostgresAdmissionAuditRepository } from "./postgres-admission-audit-repository";
import { appendAdmissionProofInvalidationAudit, type InvalidatedAdmissionProofAuditRow } from "./postgres-admission-proof-invalidation-audit";
import { readSelectedMessagingResource } from "@/src/modules/messaging/infrastructure/repositories/postgres-selected-messaging-resource-reader";

/** @param code - Unmet requirement. @returns The `admission_ineligible` outcome carrying the requirement as its private, loggable cause. */
function requirementUnmet(code: AdmissionPolicyActivationReason): AdmissionOperationError {
  return new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible, { cause: new AdmissionPolicyRequirementError(code) });
}

/**
 * @param preparation - Current tenant preparation facts. @param tribeId - Policy tribe.
 * @returns The first unmet readiness requirement, in the order the activation rules check them, or null when ready.
 */
function unmetPreparationRequirement(preparation: { tribeId: string; isAcademy: boolean; controlActivated: boolean; preflightComplete: boolean; evaluatorEnabled: boolean; recoveryLocked: boolean }, tribeId: string): AdmissionPolicyActivationReason | null {
  if (preparation.tribeId !== tribeId) return ADMISSION_POLICY_CONFIGURATION_ERROR.scopeMismatch;
  if (!preparation.isAcademy) return ADMISSION_POLICY_ACTIVATION_ERROR.notAcademy;
  if (!preparation.controlActivated || !preparation.preflightComplete) return ADMISSION_POLICY_ACTIVATION_ERROR.preflightIncomplete;
  if (!preparation.evaluatorEnabled) return ADMISSION_POLICY_ACTIVATION_ERROR.evaluatorUnavailable;
  return preparation.recoveryLocked ? ADMISSION_POLICY_ACTIVATION_ERROR.recoveryLocked : null;
}

type PolicyIntent = AdmissionPolicyInitializationIntent | AdmissionPolicyUpdateIntent | AdmissionPolicyActivationIntent | AdmissionPolicyPauseIntent;
type PolicyDatabaseExecutor = <Result>(context: AuthorizedAdmissionContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/** The original ledger and business effect share the existing guarded request boundary. */
export class PostgresAdmissionPolicyRepository implements AdmissionPolicyCommandWriter {
  /** @param execute - Actual current actor's transaction executor. @param readSecurityConfig - Live local keyring snapshot. @param composePreparation - Mandatory preparation owner bound to this exact transaction. */
  constructor(private readonly execute: PolicyDatabaseExecutor, private readonly readSecurityConfig: () => Promise<MessagingSecurityConfig>, private readonly composePreparation: (database: RequestDatabase, context: AuthorizedAdmissionContext) => AdmissionPolicyPreparationReader) {}

  /** Requires current academy settings without creating or changing those settings. */
  private async academy(database: RequestDatabase, tribeId: string): Promise<void> {
    const settings = (await database.execute<{ access_model: string }>(sql`select access_model from public.tribe_academy_settings where tribe_id=${tribeId} for share`)).rows[0];
    if (settings?.access_model !== TRIBE_ACCESS_MODEL.academy) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  }

  /** A lost policy after protection is never replaced with new editable defaults. */
  private async current(database: RequestDatabase, tribeId: string): Promise<{ policy: AdmissionPolicy | null; controlActivated: boolean }> {
    const { policy, marker } = await readAdmissionPolicyWithControlMarker(database, tribeId, true);
    if (marker && policy?.activatedAt?.getTime() !== marker.getTime() || !marker && policy?.activatedAt) throw requirementUnmet(ADMISSION_POLICY_ACTIVATION_ERROR.preflightIncomplete);
    return { policy, controlActivated: Boolean(marker) };
  }

  /** Publishes only the original minimal committed counters; current GET remains separate. */
  private result(policy: AdmissionPolicy, controlActivated: boolean, changed: boolean): AdmissionPolicyMutationResult {
    return admissionPolicyMutationResultSchema.parse({ policyId: policy.id, version: policy.version, verificationEpoch: policy.verificationEpoch, activatedAt: policy.activatedAt?.toISOString() ?? null, controlActivated, changed });
  }

  /** @param database - Original owner transaction. @param intent - Authorized original action. @param change - Exact claimed operation (`ledgerId`), locked predecessor or actual initialization absence (`previousPolicy`), effective persisted configuration (`policy`), the same native clock used by the resource write (`createdAt`) and the existing bounded private pause explanation, never a metric dimension (`reason`). @returns After staging one reconstructible effective change. */
  private async audit(database: RequestDatabase, intent: PolicyIntent, { ledgerId, previousPolicy, policy, createdAt, reason }: { ledgerId: string; previousPolicy: AdmissionPolicy | null; policy: AdmissionPolicy; createdAt: Date; reason?: string }): Promise<void> {
    await new PostgresAdmissionAuditRepository(database).append(createAdmissionPolicyAuditEvent({
      tribeId: intent.context.tribeId, actorUserId: intent.context.userId,
      operationId: ledgerId, operation: intent.type, previousPolicy, policy,
      rule: reason ?? null, createdAt,
    }));
  }

  /** @param database - Locked current transaction. @param policy - Domain-proposed effective state. @param expectedVersion - Original resource CAS. @param actorId - Native current leader. @returns The shared native resource/audit effect clock. @throws AdmissionOperationError when the original version no longer matches. */
  private async save(database: RequestDatabase, policy: AdmissionPolicy, expectedVersion: number, actorId: string): Promise<Date> {
    const changedAt = await admissionPolicyDatabaseNow(database);
    // A JavaScript Date keeps milliseconds only: the stored activation instant is kept as is when the proposal did not change it, so it still equals the tribe's protection marker to the microsecond.
    const changed = (await database.execute(sql`update public.academy_admission_policies set mode=${policy.mode},contact_type=${policy.contactType},is_open=${policy.isOpen},allow_common_exceptions=${policy.allowCommonExceptions},requires_additional_verification=${policy.requiresAdditionalVerification},requires_whatsapp_number=${policy.requiresWhatsappNumber ?? false},phone_channel=${policy.phoneChannel},allow_sms_alternative=${policy.allowSmsAlternative},messaging_connection_id=${policy.messagingConnectionId},messaging_connection_version=${policy.messagingConnectionVersion},verification_epoch=${policy.verificationEpoch},version=${policy.version},activated_at=case when date_trunc('milliseconds',activated_at)=${policy.activatedAt}::timestamptz then activated_at else ${policy.activatedAt}::timestamptz end,changed_by_user_id=${actorId},updated_at=${changedAt} where tribe_id=${policy.tribeId} and version=${expectedVersion} returning tribe_id`)).rows[0];
    if (!changed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
    return changedAt;
  }

  /** Original replay precedes new CAS; every phase independently checks current leadership. */
  private async run(intent: PolicyIntent, operation: ReauthenticationOperation, commandIntent: AdmissionOperationCommand["intent"], mutate: (database: RequestDatabase, ledgerId: string) => Promise<AdmissionPolicyMutationResult>): Promise<AdmissionOperationResult<AdmissionPolicyMutationResult>> {
    const command: AdmissionOperationCommand = { actorUserId: intent.context.userId, tribeId: intent.context.tribeId, operationType: intent.type, idempotencyKey: intent.operationId, intent: commandIntent };
    // Each ledger transaction (claim, effect, recovery) lets its repeated leader checks reuse the locks of its first one; none uses a savepoint.
    const ledger = new PostgresAdmissionOperationRepository((work) => this.execute(intent.context, (database) => withReusedAdmissionLeaderAuthority(database, () => work(database))), async (database) => { await authorizeAdmissionPolicy(database, intent.context, operation); return true; }, this.readSecurityConfig);
    try { return await ledger.run(command, admissionPolicyMutationResultSchema, async (database, ledgerId) => { await this.academy(database, intent.context.tribeId); return mutate(database, ledgerId); }); }
    catch (error) {
      if (error instanceof AdmissionOperationError && error.code === ADMISSION_ERROR_CODE.operationUnresolved) {
        try { const recovered = await ledger.read(command, admissionPolicyMutationResultSchema); if (recovered?.state === OPERATION_STATE.completed) return recovered; }
        catch (recoveryError) {
          if (recoveryError instanceof AdmissionOperationError) throw recoveryError;
          throw new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { operationId: intent.operationId, cause: new AggregateError([error, recoveryError], "Admission policy original commit reconciliation failed", { cause: error }) });
        }
      }
      throw error;
    }
  }

  /** @param intent - Explicit first configuration, with no caller version/defaults. @returns Existing configuration unchanged, or version1 closed draft bound to the current messaging selection; never activates control. */
  async initialize(intent: AdmissionPolicyInitializationIntent): Promise<AdmissionOperationResult<AdmissionPolicyMutationResult>> {
    return this.run(intent, REAUTHENTICATION_OPERATION.updateAdmissionPolicy, { confirmed: intent.confirmed }, async (database, ledgerId) => {
      const current = await this.current(database, intent.context.tribeId);
      if (current.policy) return this.result(current.policy, current.controlActivated, false);
      const defaults = createDefaultAdmissionPolicy({ id: intent.context.tribeId, tribeId: intent.context.tribeId });
      // An academy that activated its connection first starts with that selection; a later write rebinds it if an activation was still committing.
      const policy = { ...defaults, ...await this.selectionReference(database, defaults) };
      const createdAt = await admissionPolicyDatabaseNow(database);
      await database.execute(sql`insert into public.academy_admission_policies(tribe_id,requires_whatsapp_number,messaging_connection_id,messaging_connection_version,changed_by_user_id,updated_at) values (${policy.tribeId},${policy.requiresWhatsappNumber ?? false},${policy.messagingConnectionId},${policy.messagingConnectionVersion},${intent.context.userId},${createdAt})`);
      await this.audit(database, intent, { ledgerId, previousPolicy: null, policy, createdAt });
      return this.result(policy, false, true);
    });
  }

  /**
   * The messaging reference is owner-derived: only the selected version can be ready, so a policy without it (saved before any usable selection, or still naming a retired one) takes it on its next write.
   * @param database - Transaction already holding the policy lock: an activation that commits first is read here, and one still waiting replaces the reference read here.
   * @param policy - Locked current policy.
   * @returns The reference to set, or nothing when the policy already names the selection or the tribe has no usable one; an existing reference is never cleared.
   */
  private async selectionReference(database: RequestDatabase, policy: AdmissionPolicy): Promise<AdmissionPolicyPatch> {
    const selected = await readSelectedMessagingResource(database, policy.tribeId);
    if (!selected || policy.messagingConnectionId === selected.connectionId && policy.messagingConnectionVersion === selected.connectionVersion) return {};
    return { messagingConnectionId: selected.connectionId, messagingConnectionVersion: selected.connectionVersion };
  }

  /** Saves a new version without implicitly activating, opening or sending; it only binds the messaging reference to the current selection. */
  private async change(database: RequestDatabase, intent: AdmissionPolicyUpdateIntent | AdmissionPolicyPauseIntent, ledgerId: string, rules: AdmissionPolicyRulesPatch): Promise<AdmissionPolicyMutationResult> {
    const current = await this.current(database, intent.context.tribeId), policy = current.policy;
    if (!policy) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    if (policy.version !== intent.expectedVersion) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
    const patch: AdmissionPolicyPatch = { ...selectAdmissionPolicyRules(rules), ...await this.selectionReference(database, policy) };
    const next = { ...policy, ...patch };
    const effective = ADMISSION_POLICY_EDITABLE_FIELDS.some((field) => next[field] !== policy[field]);
    if (!effective) return this.result(policy, current.controlActivated, false);
    const requiresReadiness = requiresAdmissionPolicyReadiness(policy, next);
    let configuration: AdmissionPolicyConfigurationFacts = { tribeId: policy.tribeId, channelPrepared: false, verificationQuotaPositive: false, usagePolicy: null, lockedContactType: policy.activatedAt ? policy.contactType : null };
    if (requiresReadiness) {
      const preparation = await this.composePreparation(database, intent.context).read(next);
      const unmet = unmetPreparationRequirement(preparation, policy.tribeId);
      if (unmet) throw requirementUnmet(unmet);
      configuration = preparation.configuration;
    }
    const proposal = proposeAdmissionPolicyChange(policy, patch, intent.expectedVersion, configuration);
    if (proposal.outcome === ADMISSION_POLICY_CHANGE_OUTCOME.conflict) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
    if (proposal.outcome === ADMISSION_POLICY_CHANGE_OUTCOME.invalid) throw requirementUnmet(proposal.reason);
    if (proposal.outcome === ADMISSION_POLICY_CHANGE_OUTCOME.unchanged) return this.result(policy, current.controlActivated, false);
    const changedAt = await this.save(database, proposal.policy, policy.version, intent.context.userId);
    if (proposal.invalidateUnappliedEvidence) await this.invalidateUnappliedEvidence(database, intent.context, ledgerId);
    await this.audit(database, intent, { ledgerId, previousPolicy: policy, policy: proposal.policy, createdAt: changedAt, reason: "reason" in intent ? intent.reason : undefined });
    if (requiresReadiness) await this.assertCurrentPreparation(database, intent.context, proposal.policy);
    return this.result(proposal.policy, current.controlActivated, true);
  }

  /** Rechecks current external security/capability after staging; failure rolls back policy, marker and audit together. */
  private async assertCurrentPreparation(database: RequestDatabase, context: AuthorizedAdmissionContext, policy: AdmissionPolicy): Promise<void> {
    const preparation = await this.composePreparation(database, context).read(policy);
    const proposal = proposeAdmissionPolicyActivation(policy, policy.version, { ...preparation, now: await admissionPolicyDatabaseNow(database) });
    if (proposal.outcome !== ADMISSION_POLICY_CHANGE_OUTCOME.unchanged) throw requirementUnmet(proposal.outcome === ADMISSION_POLICY_CHANGE_OUTCOME.invalid ? proposal.reason : ADMISSION_POLICY_ACTIVATION_ERROR.preflightIncomplete);
  }

  /** @param database - Original policy transaction. @param context - Authorized actor and tribe. @param ledgerId - Original policy command. @returns After invalidating and auditing only unused admission evidence; diagnostics and applied evidence retain provenance. */
  private async invalidateUnappliedEvidence(database: RequestDatabase, context: AuthorizedAdmissionContext, ledgerId: string): Promise<void> {
    const tribeId = context.tribeId;
    const challenges = (await database.execute<{ id: string; channel: "email" | "sms" | "whatsapp" }>(sql`select id,channel from public.contact_verification_challenges where tribe_id=${tribeId} and purpose=${ADMISSION_VERIFICATION_PURPOSE.admission} order by id for update`)).rows;
    const now = await admissionPolicyDatabaseNow(database);
    const invalidatedProofs = (await database.execute<InvalidatedAdmissionProofAuditRow>(sql`update public.academy_admission_verification_proofs set status=${ADMISSION_PROOF_STATUS.invalid},invalidated_at=${now},invalidation_reason=${ADMISSION_POLICY_AUDIT.invalidationRule} where tribe_id=${tribeId} and status=${ADMISSION_PROOF_STATUS.available} returning id,challenge_id,verification_epoch,applied_request_id,invalidated_at`)).rows;
    await appendAdmissionProofInvalidationAudit(database, { tribeId, actorUserId: context.userId, operationId: ledgerId, cause: ADMISSION_POLICY_AUDIT.invalidationRule }, { proofs: invalidatedProofs, channels: new Map(challenges.map((challenge) => [challenge.id, challenge.channel])), previousStates: ADMISSION_PROOF_STATUS.available });
    await database.execute(sql`update public.contact_verification_challenges set is_current=false,state=case when state=${VERIFICATION_CHALLENGE_STATE.verified} then state else ${VERIFICATION_CHALLENGE_STATE.invalidated} end,version=version+1,invalidated_at=coalesce(invalidated_at,${now}),invalidation_reason=coalesce(invalidation_reason,${ADMISSION_POLICY_AUDIT.invalidationRule}),code_mac=null,code_envelope_id=null where tribe_id=${tribeId} and purpose=${ADMISSION_VERIFICATION_PURPOSE.admission} and is_current`);
  }

  /** @param intent - Original observed version and editable fields. @returns One effective CAS transition or confirmed historical replay. */
  async update(intent: AdmissionPolicyUpdateIntent): Promise<AdmissionOperationResult<AdmissionPolicyMutationResult>> {
    return this.run(intent, REAUTHENTICATION_OPERATION.updateAdmissionPolicy, { confirmed: intent.confirmed, expectedVersion: intent.expectedVersion, patch: intent.patch }, (database, ledgerId) => this.change(database, intent, ledgerId, intent.patch));
  }

  /** @param intent - Explicit original activation intent. @returns Policy and monotonic marker committed at one authoritative instant, with no membership or messaging effects. */
  async activate(intent: AdmissionPolicyActivationIntent): Promise<AdmissionOperationResult<AdmissionPolicyMutationResult>> {
    return this.run(intent, REAUTHENTICATION_OPERATION.activateAdmissionPolicy, { confirmed: intent.confirmed, expectedVersion: intent.expectedVersion }, async (database, ledgerId) => {
      const current = await this.current(database, intent.context.tribeId);
      if (!current.policy) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      if (current.policy.version !== intent.expectedVersion) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
      // Activation is the policy's single effective change: binding the current selection shares its version increment and audit.
      const bound = { ...current.policy, ...await this.selectionReference(database, current.policy) };
      const preparation = await this.composePreparation(database, intent.context).read(bound);
      const proposal = proposeAdmissionPolicyActivation(bound, intent.expectedVersion, { ...preparation, now: await admissionPolicyDatabaseNow(database) });
      if (proposal.outcome === ADMISSION_POLICY_CHANGE_OUTCOME.conflict) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
      if (proposal.outcome === ADMISSION_POLICY_CHANGE_OUTCOME.invalid) throw requirementUnmet(proposal.reason);
      if (proposal.outcome === ADMISSION_POLICY_CHANGE_OUTCOME.unchanged) return this.result(proposal.policy, true, false);
      const changedAt = await this.save(database, proposal.policy, current.policy.version, intent.context.userId);
      const updated = (await database.execute(sql`update public.tribes set admissions_control_activated_at=${proposal.controlActivatedAt} where id=${intent.context.tribeId} and admissions_control_activated_at is null returning id`)).rows[0];
      if (!updated) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
      await this.audit(database, intent, { ledgerId, previousPolicy: current.policy, policy: proposal.policy, createdAt: changedAt });
      await this.assertCurrentPreparation(database, intent.context, proposal.policy);
      return this.result(proposal.policy, true, true);
    });
  }

  /** @param intent - Reasoned closure of the observed version. @returns Closed admission while preserving marker/contact/epoch, independently of channel preparation. */
  async pause(intent: AdmissionPolicyPauseIntent): Promise<AdmissionOperationResult<AdmissionPolicyMutationResult>> {
    return this.run(intent, REAUTHENTICATION_OPERATION.pauseAdmissionPolicy, { confirmed: intent.confirmed, expectedVersion: intent.expectedVersion, reason: intent.reason }, (database, ledgerId) => this.change(database, intent, ledgerId, { isOpen: false }));
  }
}
