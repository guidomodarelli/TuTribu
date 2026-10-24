/** Proposes explicit activation without granting membership or sending any message. @module admission-policy-activation */
import { validateAdmissionPolicyConfiguration, type AdmissionPolicy, type AdmissionPolicyConfigurationFacts, type AdmissionPolicyConfigurationResult } from "../entities/admission-policy";
import { ADMISSION_POLICY_ACTIVATION_ERROR, ADMISSION_POLICY_CHANGE_OUTCOME, ADMISSION_POLICY_CONFIGURATION_ERROR } from "@/src/modules/academy-admissions/constants/admission-policy";

/** Private preparation facts are read under owner locks; no browser boolean is authority. */
export type AdmissionPolicyActivationFacts = {
  tribeId: string; isAcademy: boolean; controlActivated: boolean; preflightComplete: boolean;
  evaluatorEnabled: boolean; recoveryLocked: boolean; now: Date; configuration: AdmissionPolicyConfigurationFacts;
};
export type AdmissionPolicyActivationReason = "policy_unavailable" | "academy_unavailable" | "admission_preflight_incomplete" | "admission_evaluator_unavailable" | "admission_recovery_locked" | "admission_clock_invalid" | Extract<AdmissionPolicyConfigurationResult, { valid: false }>["reason"];
/** The marker and policy must be committed together by the actual writer. */
export type AdmissionPolicyActivationResult =
  | { outcome: "conflict" }
  | { outcome: "invalid"; reason: AdmissionPolicyActivationReason }
  | { outcome: "unchanged"; policy: AdmissionPolicy }
  | { outcome: "changed"; policy: AdmissionPolicy; controlActivatedAt: Date };

/**
 * Checks authoritative preparation and capability before proposing the first durable cutover.
 * @param policy - Current stored draft; absence never manufactures a policy or version.
 * @param expectedVersion - Observed version for a new intent, after the owner recovered any original replay.
 * @param facts - Current scope/preflight/platform/readiness and post-lock time.
 * @returns A closed denial, version conflict, no-op or indivisible policy/marker proposal.
 */
export function proposeAdmissionPolicyActivation(policy: AdmissionPolicy | null, expectedVersion: number, facts: AdmissionPolicyActivationFacts): AdmissionPolicyActivationResult {
  const invalid = (reason: AdmissionPolicyActivationReason): AdmissionPolicyActivationResult => ({ outcome: ADMISSION_POLICY_CHANGE_OUTCOME.invalid, reason });
  if (!policy) return invalid(ADMISSION_POLICY_ACTIVATION_ERROR.policyMissing);
  if (policy.tribeId !== facts.tribeId || facts.configuration.tribeId !== facts.tribeId) return invalid(ADMISSION_POLICY_CONFIGURATION_ERROR.scopeMismatch);
  if (policy.version !== expectedVersion) return { outcome: ADMISSION_POLICY_CHANGE_OUTCOME.conflict };
  if (!facts.isAcademy) return invalid(ADMISSION_POLICY_ACTIVATION_ERROR.notAcademy);
  if (!facts.preflightComplete || Boolean(policy.activatedAt) !== facts.controlActivated) return invalid(ADMISSION_POLICY_ACTIVATION_ERROR.preflightIncomplete);
  if (!facts.evaluatorEnabled) return invalid(ADMISSION_POLICY_ACTIVATION_ERROR.evaluatorUnavailable);
  if (facts.recoveryLocked) return invalid(ADMISSION_POLICY_ACTIVATION_ERROR.recoveryLocked);
  if (!Number.isFinite(facts.now.getTime())) return invalid(ADMISSION_POLICY_ACTIVATION_ERROR.clockInvalid);
  const validation = validateAdmissionPolicyConfiguration(policy, facts.configuration);
  if (!validation.valid) return invalid(validation.reason);
  if (facts.controlActivated) return { outcome: ADMISSION_POLICY_CHANGE_OUTCOME.unchanged, policy };
  const activatedAt = new Date(facts.now);
  return { outcome: ADMISSION_POLICY_CHANGE_OUTCOME.changed, policy: { ...policy, activatedAt, version: policy.version + 1 }, controlActivatedAt: new Date(activatedAt) };
}
