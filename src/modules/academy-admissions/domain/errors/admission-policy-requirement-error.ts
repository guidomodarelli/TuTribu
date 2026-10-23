/** Names the unmet policy requirement behind an `admission_ineligible` outcome. @module admission-policy-requirement-error */
import type { AdmissionPolicyActivationReason } from "../policies/admission-policy-activation";

/**
 * Private cause of an `admission_ineligible` policy outcome: the closed requirement code reaches the server log
 * through the route boundary's cause summary, so a 409 says which requirement failed. It is never serialized to the browser,
 * which reads the current requirements on its own.
 */
export class AdmissionPolicyRequirementError extends Error {
  /** @param code - Closed requirement code from the activation or configuration rules. */
  constructor(public readonly code: AdmissionPolicyActivationReason) {
    super(`AdmissionPolicy requirement unmet: ${code}`);
    this.name = "AdmissionPolicyRequirementError";
  }
}
