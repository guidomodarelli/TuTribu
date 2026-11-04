/** Projects the platform security requirement the rules read lists, so every leader screen blocks its writes before one fails. @module admission-platform-requirement */
import { z } from "zod";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import { PLATFORM_SECURITY_REQUIREMENT } from "@/src/modules/shared/constants/platform-security";
import { ADMISSION_POLICY_ACTIVATION_ERROR } from "../../constants/admission-policy";
import type { AdmissionPolicyStateDto } from "./admission-policy-result-schemas";

/** Closed platform fact of a leader page state: null while the platform can protect every write of that screen. */
export const admissionPlatformRequirementSchema = z.enum(PLATFORM_SECURITY_REQUIREMENT).nullable();

/**
 * @param policy - Current rules read; its requirements already name the platform requirement, computed with the same checks every ledger write runs.
 * @returns The platform requirement that blocks every admission write, or null when the platform can protect them.
 */
export function readAdmissionPlatformRequirement(policy: Pick<AdmissionPolicyStateDto, "preparation">): PlatformSecurityRequirement | null {
  const { requirements } = policy.preparation;
  if (requirements.includes(ADMISSION_POLICY_ACTIVATION_ERROR.securityUnconfigured)) return PLATFORM_SECURITY_REQUIREMENT.unconfigured;
  return requirements.includes(ADMISSION_POLICY_ACTIVATION_ERROR.recoveryLocked) ? PLATFORM_SECURITY_REQUIREMENT.recoveryLocked : null;
}
