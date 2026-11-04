/** Names the platform security requirements shared by admissions, messaging and notifications reads. @module platform-security */
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";

export const PLATFORM_SECURITY_REQUIREMENT = {
  /** The hosting messaging security is missing, cannot be imported, or its keys are not enrolled. */
  unconfigured: "security_unconfigured",
  /** The platform locked the hosting messaging security while it recovers a service. */
  recoveryLocked: "recovery_locked",
} as const satisfies Record<string, PlatformSecurityRequirement>;
