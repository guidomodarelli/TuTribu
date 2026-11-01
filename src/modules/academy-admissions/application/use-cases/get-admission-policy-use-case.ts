/** Projects current leader policy/impact without initializing or treating an informational query as a command. @module get-admission-policy-use-case */
import type { ResolveAdmissionContextUseCase } from "./resolve-admission-context-use-case";
import type { AdmissionPolicyState, AdmissionPolicyStateReader, AdmissionPolicyViewFactsReader } from "../../domain/repositories/admission-policy-management";
import { validateAdmissionPolicyConfiguration, validateAdmissionPolicyDraftConfiguration } from "../../domain/entities/admission-policy";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ADMISSION_POLICY_PUBLIC_STATE, ADMISSION_POLICY_PREPARATION_STATE, ADMISSION_POLICY_ACTIVATION_ERROR } from "../../constants/admission-policy";
import { admissionPolicyStateResultSchema } from "../results/admission-policy-result-schemas";
import { admissionOperationFailure } from "../results/admission-operation-failure";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import type { AdmissionPolicyActivationReason } from "../../domain/policies/admission-policy-activation";

/** Each owner performs its own current authorization; query facts are never a reusable permission token. */
export class GetAdmissionPolicyUseCase {
  /** @param resolver - Current native account and canonical leadership. @param reader - Read-only stored configuration/countries. @param facts - Current impact/preflight/capability owner, independently authorized. */
  constructor(private readonly resolver: Pick<ResolveAdmissionContextUseCase, "execute">, private readonly reader: AdmissionPolicyStateReader, private readonly facts: AdmissionPolicyViewFactsReader) {}

  /** An owned reader cannot substitute another tenant's entity/country projection, even when versions coincide. */
  private assertScope(current: AdmissionPolicyState, tribeId: string): void {
    if (current.policy && (current.policy.tribeId !== tribeId || current.policy.id !== tribeId) || current.usage && current.usage.tribeId !== tribeId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
  }

  /** @param query - Boundary-validated tribe and correlation. @returns Own DTO with real absence, current protection and safe readiness reasons; no original operation is replayed into this view. */
  async execute(query: { tribeId: string; requestId: string }) {
    try {
      const authority = await this.resolver.execute({ ...query, action: ADMISSION_ACTION.readPolicy });
      if (!authority.allowed) return { ok: false as const, failure: authority.failure };
      const current = await this.reader.read(authority.context);
      this.assertScope(current, query.tribeId);
      const view = await this.facts.read(authority.context, current.policy);
      const confirmed = await this.reader.read(authority.context);
      this.assertScope(confirmed, query.tribeId);
      if (confirmed.controlActivated !== current.controlActivated || confirmed.policy?.version !== current.policy?.version || confirmed.usage?.version !== current.usage?.version) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
      const policy = current.policy, preparation = view.preparation;
      if (preparation) assertPreparationScope(preparation, query.tribeId, current);
      const consistent = Boolean(policy?.activatedAt) === current.controlActivated;
      const state = admissionPolicyPublicState(consistent, policy, current.controlActivated);
      const configuration = preparation?.configuration ?? { tribeId: query.tribeId, channelPrepared: false, verificationQuotaPositive: false, usagePolicy: current.usage, lockedContactType: policy?.activatedAt ? policy.contactType : null };
      const structural = policy ? validateAdmissionPolicyDraftConfiguration(policy, configuration) : null;
      const operational = policy && preparation ? validateAdmissionPolicyConfiguration(policy, configuration) : null;
      const requirements = activationRequirements({ policy, preparation, consistent, controlActivated: current.controlActivated, structural, operational });
      const usage = current.usage ? { version: current.usage.version, allowedCountries: [...current.usage.allowedCountries] } : null;
      const value = admissionPolicyStateResultSchema.parse({ state, controlActivated: current.controlActivated,
        policy: policy ? projectAdmissionPolicy(policy, usage, validationReasons(structural, operational)) : null,
        usage, preparation: { state: preparation ? ADMISSION_POLICY_PREPARATION_STATE.evaluated : ADMISSION_POLICY_PREPARATION_STATE.notEvaluated, requirements: [...new Set(requirements)] },
        impact: { pendingRequestCount: view.pendingRequestCount, ...(view.freeConversionMemberCount === undefined || current.controlActivated ? {} : { freeConversionMemberCount: view.freeConversionMemberCount }), contactTypeLocked: Boolean(policy?.activatedAt) || current.controlActivated, historicalLinksProtected: current.controlActivated, warnings: structural?.warnings ?? [] } });
      return { ok: true as const, value };
    } catch (error) { return admissionOperationFailure(error); }
  }
}

type ReadAdmissionPolicy = NonNullable<AdmissionPolicyState["policy"]>;
type AdmissionPolicyPreparation = NonNullable<Awaited<ReturnType<AdmissionPolicyViewFactsReader["read"]>>["preparation"]>;
type DraftValidation = ReturnType<typeof validateAdmissionPolicyDraftConfiguration>;
type OperationalValidation = ReturnType<typeof validateAdmissionPolicyConfiguration>;

/** @throws AdmissionOperationError when the preparation names another tribe or a usage version other than the stored one. */
function assertPreparationScope(preparation: AdmissionPolicyPreparation, tribeId: string, current: AdmissionPolicyState): void {
  if (preparation.tribeId !== tribeId || preparation.configuration.tribeId !== tribeId || preparation.configuration.usagePolicy && preparation.configuration.usagePolicy.tribeId !== tribeId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
  if (preparation.configuration.usagePolicy?.version !== current.usage?.version) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.policyConflict);
}

/** @returns Unavailable when activation facts disagree; otherwise not configured, draft, active or paused. */
function admissionPolicyPublicState(consistent: boolean, policy: AdmissionPolicyState["policy"], controlActivated: boolean) {
  if (!consistent) return ADMISSION_POLICY_PUBLIC_STATE.unavailable;
  if (!policy) return controlActivated ? ADMISSION_POLICY_PUBLIC_STATE.unavailable : ADMISSION_POLICY_PUBLIC_STATE.notConfigured;
  if (!policy.activatedAt) return ADMISSION_POLICY_PUBLIC_STATE.draft;
  return policy.isOpen ? ADMISSION_POLICY_PUBLIC_STATE.active : ADMISSION_POLICY_PUBLIC_STATE.paused;
}

/** @returns Every reason that currently blocks activation, in display order. */
function activationRequirements({ policy, preparation, consistent, controlActivated, structural, operational }: { policy: AdmissionPolicyState["policy"]; preparation: AdmissionPolicyPreparation | null; consistent: boolean; controlActivated: boolean; structural: DraftValidation | null; operational: OperationalValidation | null }): AdmissionPolicyActivationReason[] {
  const requirements: AdmissionPolicyActivationReason[] = [];
  if (!policy) requirements.push(ADMISSION_POLICY_ACTIVATION_ERROR.policyMissing);
  if (!consistent || preparation && (!preparation.preflightComplete || preparation.controlActivated !== controlActivated)) requirements.push(ADMISSION_POLICY_ACTIVATION_ERROR.preflightIncomplete);
  if (preparation && !preparation.isAcademy) requirements.push(ADMISSION_POLICY_ACTIVATION_ERROR.notAcademy);
  if (preparation && !preparation.evaluatorEnabled) requirements.push(ADMISSION_POLICY_ACTIVATION_ERROR.evaluatorUnavailable);
  if (preparation?.recoveryLocked) requirements.push(ADMISSION_POLICY_ACTIVATION_ERROR.recoveryLocked);
  requirements.push(...validationReasons(structural, operational));
  return requirements;
}

/** @returns The structural reason, then the operational one, for each failed validation. */
function validationReasons(structural: DraftValidation | null, operational: OperationalValidation | null): AdmissionPolicyActivationReason[] {
  return [...(structural && !structural.valid ? [structural.reason] : []), ...(operational && !operational.valid ? [operational.reason] : [])];
}

/** @returns The leader-facing policy fields with its usage and deduplicated validation requirements. */
function projectAdmissionPolicy(policy: ReadAdmissionPolicy, usage: { version: number; allowedCountries: string[] } | null, reasons: AdmissionPolicyActivationReason[]) {
  return { id: policy.id, version: policy.version, verificationEpoch: policy.verificationEpoch, mode: policy.mode, contactType: policy.contactType, isOpen: policy.isOpen, allowCommonExceptions: policy.allowCommonExceptions, requiresAdditionalVerification: policy.requiresAdditionalVerification, requiresWhatsappNumber: policy.requiresWhatsappNumber ?? false, phoneChannel: policy.phoneChannel, allowSmsAlternative: policy.allowSmsAlternative, activatedAt: policy.activatedAt?.toISOString() ?? null, messagingConnectionId: policy.messagingConnectionId, messagingConnectionVersion: policy.messagingConnectionVersion, usage, requirements: [...new Set(reasons)] };
}
