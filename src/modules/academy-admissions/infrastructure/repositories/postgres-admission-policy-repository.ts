/** Commits explicit policy commands with current authority, original replay and resource CAS. @module postgres-admission-policy-repository */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import type { AuthorizedAdmissionContext } from "../../domain/repositories/admission-authorization-reader";
import type { AdmissionPolicyCommandWriter, AdmissionPolicyInitializationIntent, AdmissionPolicyUpdateIntent, AdmissionPolicyActivationIntent, AdmissionPolicyPauseIntent, AdmissionPolicyMutationResult, AdmissionPolicyPreparationReader } from "../../domain/repositories/admission-policy-management";
import type { AdmissionOperationCommand, AdmissionOperationResult } from "../../domain/entities/admission-operation";
import { createDefaultAdmissionPolicy, proposeAdmissionPolicyChange, type AdmissionPolicy, type AdmissionPolicyPatch, type AdmissionPolicyConfigurationFacts } from "../../domain/entities/admission-policy";
import { proposeAdmissionPolicyActivation } from "../../domain/policies/admission-policy-activation";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_POLICY_AUDIT, ADMISSION_POLICY_EDITABLE_FIELDS, ADMISSION_POLICY_CHANGE_OUTCOME } from "../../constants/admission-policy";
import { ADMISSION_PROOF_STATUS, ADMISSION_VERIFICATION_PURPOSE } from "../../constants/admission-eligibility";
import { VERIFICATION_CHALLENGE_STATE } from "../../constants/verification-challenge";
import { REAUTHENTICATION_OPERATION, type ReauthenticationOperation } from "@/src/modules/auth/constants/reauthentication-resources";
import { TRIBE_ACCESS_MODEL } from "@/src/modules/product-access/constants/product-access";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { PostgresAdmissionOperationRepository } from "./postgres-admission-operation-repository";
import { admissionPolicyMutationResultSchema } from "../../application/results/admission-policy-result-schemas";
import { admissionPolicyDatabaseNow, authorizeAdmissionPolicy } from "./postgres-admission-policy-authorizer";
import { readAdmissionControlMarker, readAdmissionPolicy } from "./postgres-admission-policy-storage";

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
    const policy = await readAdmissionPolicy(database, tribeId, true), marker = await readAdmissionControlMarker(database, tribeId);
    if (marker && (!policy?.activatedAt || policy.activatedAt.getTime() !== marker.getTime()) || !marker && policy?.activatedAt) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
    return { policy, controlActivated: Boolean(marker) };
  }

  /** Publishes only the original minimal committed counters; current GET remains separate. */
  private result(policy: AdmissionPolicy, controlActivated: boolean, changed: boolean): AdmissionPolicyMutationResult {
    return admissionPolicyMutationResultSchema.parse({ policyId: policy.id, version: policy.version, verificationEpoch: policy.verificationEpoch, activatedAt: policy.activatedAt?.toISOString() ?? null, controlActivated, changed });
  }

  /** Records only effective changes and their private original operation link. */
  private async audit(database: RequestDatabase, intent: PolicyIntent, ledgerId: string, policy: AdmissionPolicy, reason?: string): Promise<void> {
    await database.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,resource_version) values (${intent.context.tribeId},${intent.context.userId},${ADMISSION_POLICY_AUDIT.resourceType},${policy.id},${ledgerId},${intent.type},${reason ?? null},${policy.version})`);
  }

  /** Resource update increments exactly the domain-proposed counters under the expected version. */
  private async save(database: RequestDatabase, policy: AdmissionPolicy, expectedVersion: number, actorId: string): Promise<void> {
    const changed = (await database.execute(sql`update public.academy_admission_policies set mode=${policy.mode},contact_type=${policy.contactType},is_open=${policy.isOpen},allow_common_exceptions=${policy.allowCommonExceptions},requires_additional_verification=${policy.requiresAdditionalVerification},phone_channel=${policy.phoneChannel},allow_sms_alternative=${policy.allowSmsAlternative},messaging_connection_id=${policy.messagingConnectionId},messaging_connection_version=${policy.messagingConnectionVersion},verification_epoch=${policy.verificationEpoch},version=${policy.version},activated_at=${policy.activatedAt},changed_by_user_id=${actorId},updated_at=clock_timestamp() where tribe_id=${policy.tribeId} and version=${expectedVersion} returning tribe_id`)).rows[0];
    if (!changed) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
  }

  /** Original replay precedes new CAS; every phase independently checks current leadership and recency. */
  private async run(intent: PolicyIntent, operation: ReauthenticationOperation, commandIntent: AdmissionOperationCommand["intent"], mutate: (database: RequestDatabase, ledgerId: string) => Promise<AdmissionPolicyMutationResult>): Promise<AdmissionOperationResult<AdmissionPolicyMutationResult>> {
    const command: AdmissionOperationCommand = { actorUserId: intent.context.userId, tribeId: intent.context.tribeId, operationType: intent.type, idempotencyKey: intent.operationId, intent: commandIntent };
    const ledger = new PostgresAdmissionOperationRepository((work) => this.execute(intent.context, work), async (database) => { await authorizeAdmissionPolicy(database, intent.context, operation); return true; }, this.readSecurityConfig);
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

  /** @param intent - Explicit first configuration, with no caller version/defaults. @returns Existing configuration unchanged, or version1 closed draft; never activates control. */
  async initialize(intent: AdmissionPolicyInitializationIntent): Promise<AdmissionOperationResult<AdmissionPolicyMutationResult>> {
    return this.run(intent, REAUTHENTICATION_OPERATION.updateAdmissionPolicy, { confirmed: intent.confirmed }, async (database, ledgerId) => {
      const current = await this.current(database, intent.context.tribeId);
      if (current.policy) return this.result(current.policy, current.controlActivated, false);
      const policy = createDefaultAdmissionPolicy({ id: intent.context.tribeId, tribeId: intent.context.tribeId });
      await database.execute(sql`insert into public.academy_admission_policies(tribe_id,changed_by_user_id) values (${policy.tribeId},${intent.context.userId})`);
      await this.audit(database, intent, ledgerId, policy);
      return this.result(policy, false, true);
    });
  }

  /** Saves a new version without implicitly activating, opening, connecting or sending. */
  private async change(database: RequestDatabase, intent: AdmissionPolicyUpdateIntent | AdmissionPolicyPauseIntent, ledgerId: string, patch: AdmissionPolicyPatch): Promise<AdmissionPolicyMutationResult> {
    const current = await this.current(database, intent.context.tribeId), policy = current.policy;
    if (!policy) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
    if (policy.version !== intent.expectedVersion) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
    const next = { ...policy, ...patch };
    const effective = ADMISSION_POLICY_EDITABLE_FIELDS.some((field) => next[field] !== policy[field]);
    if (!effective) return this.result(policy, current.controlActivated, false);
    const onlyPausing = policy.isOpen && !next.isOpen && ADMISSION_POLICY_EDITABLE_FIELDS.every((field) => field === "isOpen" || next[field] === policy[field]);
    let configuration: AdmissionPolicyConfigurationFacts = { tribeId: policy.tribeId, channelPrepared: false, verificationQuotaPositive: false, usagePolicy: null, lockedContactType: policy.activatedAt ? policy.contactType : null };
    if (policy.activatedAt && !onlyPausing) {
      const preparation = await this.composePreparation(database, intent.context).read(next);
      if (preparation.tribeId !== policy.tribeId || !preparation.isAcademy || !preparation.controlActivated || !preparation.preflightComplete || !preparation.evaluatorEnabled || preparation.recoveryLocked) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
      configuration = preparation.configuration;
    }
    const proposal = proposeAdmissionPolicyChange(policy, patch, intent.expectedVersion, configuration);
    if (proposal.outcome === ADMISSION_POLICY_CHANGE_OUTCOME.conflict) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
    if (proposal.outcome === ADMISSION_POLICY_CHANGE_OUTCOME.invalid) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
    if (proposal.outcome === ADMISSION_POLICY_CHANGE_OUTCOME.unchanged) return this.result(policy, current.controlActivated, false);
    await this.save(database, proposal.policy, policy.version, intent.context.userId);
    if (proposal.invalidateUnappliedEvidence) await this.invalidateUnappliedEvidence(database, policy.tribeId);
    await this.audit(database, intent, ledgerId, proposal.policy, "reason" in intent ? intent.reason : undefined);
    if (policy.activatedAt && !onlyPausing) await this.assertCurrentPreparation(database, intent.context, proposal.policy);
    return this.result(proposal.policy, current.controlActivated, true);
  }

  /** Rechecks current external security/capability after staging; failure rolls back policy, marker and audit together. */
  private async assertCurrentPreparation(database: RequestDatabase, context: AuthorizedAdmissionContext, policy: AdmissionPolicy): Promise<void> {
    const preparation = await this.composePreparation(database, context).read(policy);
    const proposal = proposeAdmissionPolicyActivation(policy, policy.version, { ...preparation, now: await admissionPolicyDatabaseNow(database) });
    if (proposal.outcome !== ADMISSION_POLICY_CHANGE_OUTCOME.unchanged) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
  }

  /** Invalidates admission-only unused authority; diagnostics and applied historical evidence retain their provenance. */
  private async invalidateUnappliedEvidence(database: RequestDatabase, tribeId: string): Promise<void> {
    await database.execute(sql`select id from public.contact_verification_challenges where tribe_id=${tribeId} and purpose=${ADMISSION_VERIFICATION_PURPOSE.admission} order by id for update`);
    const now = await admissionPolicyDatabaseNow(database);
    await database.execute(sql`update public.academy_admission_verification_proofs set status=${ADMISSION_PROOF_STATUS.invalid},invalidated_at=${now},invalidation_reason=${ADMISSION_POLICY_AUDIT.invalidationRule} where tribe_id=${tribeId} and status=${ADMISSION_PROOF_STATUS.available}`);
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
      const preparation = await this.composePreparation(database, intent.context).read(current.policy);
      const proposal = proposeAdmissionPolicyActivation(current.policy, intent.expectedVersion, { ...preparation, now: await admissionPolicyDatabaseNow(database) });
      if (proposal.outcome === ADMISSION_POLICY_CHANGE_OUTCOME.conflict) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
      if (proposal.outcome === ADMISSION_POLICY_CHANGE_OUTCOME.invalid) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.admissionIneligible);
      if (proposal.outcome === ADMISSION_POLICY_CHANGE_OUTCOME.unchanged) return this.result(proposal.policy, true, false);
      await this.save(database, proposal.policy, current.policy.version, intent.context.userId);
      const updated = (await database.execute(sql`update public.tribes set admissions_control_activated_at=${proposal.controlActivatedAt} where id=${intent.context.tribeId} and admissions_control_activated_at is null returning id`)).rows[0];
      if (!updated) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
      await this.audit(database, intent, ledgerId, proposal.policy);
      await this.assertCurrentPreparation(database, intent.context, proposal.policy);
      return this.result(proposal.policy, true, true);
    });
  }

  /** @param intent - Reasoned closure of the observed version. @returns Closed admission while preserving marker/contact/epoch, independently of channel preparation. */
  async pause(intent: AdmissionPolicyPauseIntent): Promise<AdmissionOperationResult<AdmissionPolicyMutationResult>> {
    return this.run(intent, REAUTHENTICATION_OPERATION.pauseAdmissionPolicy, { confirmed: intent.confirmed, expectedVersion: intent.expectedVersion, reason: intent.reason }, (database, ledgerId) => this.change(database, intent, ledgerId, { isOpen: false }));
  }
}
