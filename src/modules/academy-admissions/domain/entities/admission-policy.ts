/**
 * Defines admission configuration and its compatibility matrix independently of providers.
 *
 * @module admission-policy
 */
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import {
  ADMISSION_PHONE_CHANNEL,
  ADMISSION_POLICY_CONFIGURATION_ERROR,
  ADMISSION_POLICY_CONFIGURATION_WARNING,
  ADMISSION_POLICY_MODE,
  ADMISSION_POLICY_EDITABLE_FIELDS,
  ADMISSION_POLICY_CHANGE_OUTCOME,
} from "@/src/modules/academy-admissions/constants/admission-policy";
import type { AdmissionContactType } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import type { AdmissionMessagingUsagePolicy } from "@/src/modules/academy-admissions/domain/repositories/messaging-usage-policy-reader";

/** Describes editable policy settings without duplicating allowed countries. */
export type AdmissionPolicyConfiguration = {
  tribeId: string;
  mode: "manual_review" | "allowlist";
  contactType: AdmissionContactType;
  isOpen: boolean;
  allowCommonExceptions: boolean;
  requiresAdditionalVerification: boolean;
  phoneChannel?: "sms" | "whatsapp" | null;
  allowSmsAlternative?: boolean;
};

/** Preserves server-controlled identity, lifecycle, and independent policy counters. */
export type AdmissionPolicy = AdmissionPolicyConfiguration & {
  id: string;
  version: number;
  verificationEpoch: number;
  phoneChannel: "sms" | "whatsapp" | null;
  allowSmsAlternative: boolean;
  messagingConnectionId: string | null;
  messagingConnectionVersion: number | null;
  activatedAt: Date | null;
};

/** Supplies own, authorized capability facts when activating/editing configuration. */
export type AdmissionPolicyConfigurationFacts = {
  tribeId: string;
  channelPrepared: boolean;
  verificationQuotaPositive: boolean;
  smsAlternativePrepared?: boolean;
  usagePolicy: AdmissionMessagingUsagePolicy | null;
  lockedContactType?: AdmissionContactType | null;
};
type ConfigurationWarning = (typeof ADMISSION_POLICY_CONFIGURATION_WARNING)[keyof typeof ADMISSION_POLICY_CONFIGURATION_WARNING];
export type AdmissionPolicyConfigurationResult =
  | { valid: true; warnings: ConfigurationWarning[] }
  | { valid: false; reason: (typeof ADMISSION_POLICY_CONFIGURATION_ERROR)[keyof typeof ADMISSION_POLICY_CONFIGURATION_ERROR]; warnings: ConfigurationWarning[] };

/**
 * Creates the explicitly closed first configuration without activating anything.
 *
 * @param identity - IDs assigned by the server for this policy and tribe.
 * @returns Manual email/OFF settings with independent version and epoch counters.
 */
export function createDefaultAdmissionPolicy(identity: { id: string; tribeId: string }): AdmissionPolicy {
  return {
    ...identity,
    mode: ADMISSION_POLICY_MODE.manualReview,
    contactType: ADMISSION_CONTACT_TYPE.email,
    isOpen: false,
    allowCommonExceptions: false,
    requiresAdditionalVerification: false,
    phoneChannel: null,
    allowSmsAlternative: false,
    messagingConnectionId: null,
    messagingConnectionVersion: null,
    activatedAt: null,
    version: 1,
    verificationEpoch: 1,
  };
}

/**
 * Validates activation/edit compatibility using current facts from authorized ports.
 *
 * This is a configuration check, not a check of an already verified code or proof.
 * Country changes do not retroactively invalidate applied evidence.
 *
 * @param policy - Proposed own policy configuration.
 * @param facts - Current channel, quota, lock, and usage-owner projection.
 * @param requiresReadiness - Whether this change enables operational capability.
 * @returns Compatibility and stable warnings/errors without transport or side effects.
 */
function validatePolicyConfiguration(
  policy: AdmissionPolicyConfiguration,
  facts: AdmissionPolicyConfigurationFacts,
  requiresReadiness: boolean,
): AdmissionPolicyConfigurationResult {
  const warnings: ConfigurationWarning[] = [];
  const failure = (reason: (typeof ADMISSION_POLICY_CONFIGURATION_ERROR)[keyof typeof ADMISSION_POLICY_CONFIGURATION_ERROR]): AdmissionPolicyConfigurationResult => ({ valid: false, reason, warnings });
  if (facts.tribeId !== policy.tribeId || (facts.usagePolicy && facts.usagePolicy.tribeId !== policy.tribeId)) {
    return failure(ADMISSION_POLICY_CONFIGURATION_ERROR.scopeMismatch);
  }
  if (facts.lockedContactType && facts.lockedContactType !== policy.contactType) {
    return failure(ADMISSION_POLICY_CONFIGURATION_ERROR.contactTypeLocked);
  }
  const isPhone = policy.contactType === ADMISSION_CONTACT_TYPE.phone;
  if (isPhone && policy.mode === ADMISSION_POLICY_MODE.allowlist && !policy.requiresAdditionalVerification) {
    return failure(ADMISSION_POLICY_CONFIGURATION_ERROR.phoneAllowlistVerificationRequired);
  }
  if (policy.allowSmsAlternative && (!isPhone || policy.phoneChannel !== ADMISSION_PHONE_CHANNEL.whatsapp || !policy.requiresAdditionalVerification)) {
    return failure(ADMISSION_POLICY_CONFIGURATION_ERROR.smsAlternativeInvalid);
  }
  if (requiresReadiness && policy.allowSmsAlternative && !facts.smsAlternativePrepared) {
    return failure(ADMISSION_POLICY_CONFIGURATION_ERROR.smsAlternativeUnavailable);
  }
  if (!policy.requiresAdditionalVerification) {
    if (isPhone) warnings.push(ADMISSION_POLICY_CONFIGURATION_WARNING.phoneInvitationsUnavailable);
    return { valid: true, warnings };
  }
  if (!requiresReadiness) return { valid: true, warnings };
  if (!facts.channelPrepared) return failure(ADMISSION_POLICY_CONFIGURATION_ERROR.verificationUnavailable);
  if (!facts.verificationQuotaPositive) return failure(ADMISSION_POLICY_CONFIGURATION_ERROR.verificationQuotaUnavailable);
  if (isPhone) {
    if (!policy.phoneChannel) return failure(ADMISSION_POLICY_CONFIGURATION_ERROR.phoneChannelRequired);
    if (!facts.usagePolicy?.allowedCountries.length) return failure(ADMISSION_POLICY_CONFIGURATION_ERROR.countriesNotConfigured);
    const hasPermittedCountry = facts.usagePolicy.allowedCountries.some((country) =>
      !facts.usagePolicy?.platformRestrictions.some((restriction) => restriction.country === country && restriction.channel === policy.phoneChannel && !restriction.allowed),
    );
    if (!hasPermittedCountry) return failure(ADMISSION_POLICY_CONFIGURATION_ERROR.countriesRestricted);
  }
  return { valid: true, warnings };
}

/**
 * Validates a configuration before enabling it with current authorized readiness facts.
 *
 * @param policy - Proposed own settings without a second editable country list.
 * @param facts - Capability, country, and immutable-contact facts for this tribe.
 * @returns Compatibility and operational requirements without any provider call.
 */
export function validateAdmissionPolicyConfiguration(
  policy: AdmissionPolicyConfiguration,
  facts: AdmissionPolicyConfigurationFacts,
): AdmissionPolicyConfigurationResult {
  return validatePolicyConfiguration(policy, facts, true);
}

export type AdmissionPolicyPatch = Partial<Pick<AdmissionPolicy, (typeof ADMISSION_POLICY_EDITABLE_FIELDS)[number]>>;
export type AdmissionPolicyChangeResult =
  | { outcome: "conflict" }
  | { outcome: "invalid"; reason: Extract<AdmissionPolicyConfigurationResult, { valid: false }>["reason"] }
  | { outcome: "unchanged"; policy: AdmissionPolicy }
  | { outcome: "changed"; policy: AdmissionPolicy; invalidateUnappliedEvidence: boolean; requiresPendingRecheck: true };

/**
 * Proposes one effective settings change while preserving identity and activation.
 *
 * Application must authorize the current actor and recover a confirmed operation
 * before this new-intent check. The writer still compares/increments atomically;
 * this proposal is not a substitute for database CAS or operation-ledger replay.
 *
 * @param current - Current locked policy snapshot.
 * @param patch - Only editable settings, normalized at the input boundary.
 * @param expectedVersion - Version explicitly observed for this new intent.
 * @param facts - Current readiness facts and the immutable selected contact type.
 * @returns A conflict, no-op, invalid proposal, or one version/epoch transition.
 */
export function proposeAdmissionPolicyChange(
  current: AdmissionPolicy,
  patch: AdmissionPolicyPatch,
  expectedVersion: number,
  facts: AdmissionPolicyConfigurationFacts,
): AdmissionPolicyChangeResult {
  if (facts.tribeId !== current.tribeId || (facts.usagePolicy && facts.usagePolicy.tribeId !== current.tribeId)) {
    return { outcome: ADMISSION_POLICY_CHANGE_OUTCOME.invalid, reason: ADMISSION_POLICY_CONFIGURATION_ERROR.scopeMismatch };
  }
  if (expectedVersion !== current.version) return { outcome: ADMISSION_POLICY_CHANGE_OUTCOME.conflict };
  const next = { ...current };
  for (const field of ADMISSION_POLICY_EDITABLE_FIELDS) {
    if (patch[field] !== undefined) Object.assign(next, { [field]: patch[field] });
  }
  const hasEffectiveChange = ADMISSION_POLICY_EDITABLE_FIELDS.some((field) => current[field] !== next[field]);
  if (!hasEffectiveChange) return { outcome: ADMISSION_POLICY_CHANGE_OUTCOME.unchanged, policy: current };
  const isOnlyPausing = current.isOpen && !next.isOpen
    && ADMISSION_POLICY_EDITABLE_FIELDS.every((field) => field === "isOpen" || current[field] === next[field]);
  const validation = validatePolicyConfiguration(next, {
    ...facts, lockedContactType: current.activatedAt ? current.contactType : facts.lockedContactType,
  }, !isOnlyPausing);
  if (!validation.valid) return { outcome: ADMISSION_POLICY_CHANGE_OUTCOME.invalid, reason: validation.reason };
  const verificationChanged = current.requiresAdditionalVerification !== next.requiresAdditionalVerification;
  const verificationContextChanged = current.phoneChannel !== next.phoneChannel
    || current.messagingConnectionId !== next.messagingConnectionId
    || current.messagingConnectionVersion !== next.messagingConnectionVersion;
  const startsNewEpoch = !current.requiresAdditionalVerification && next.requiresAdditionalVerification;
  return {
    outcome: ADMISSION_POLICY_CHANGE_OUTCOME.changed,
    policy: { ...next, version: current.version + 1, verificationEpoch: current.verificationEpoch + (startsNewEpoch ? 1 : 0) },
    invalidateUnappliedEvidence: verificationChanged || verificationContextChanged,
    requiresPendingRecheck: true,
  };
}
