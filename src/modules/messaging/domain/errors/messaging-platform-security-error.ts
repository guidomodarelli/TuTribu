/** Names a messaging operation the platform cannot protect, independently of the hosting crypto implementation. @module messaging-platform-security-error */
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

/**
 * A definitive rejection before any effect: the hosting messaging security is missing, unusable, not enrolled or locked
 * for recovery, so only the TuTribu team can resolve it. Its closed code is never a 5xx and registers nothing.
 */
export class MessagingPlatformSecurityError extends Error {
  readonly code = MESSAGING_ERROR_CODE.platformSecurityUnavailable;
  /**
   * @param requirement - Platform requirement that blocks the operation.
   * @param options - Original private hosting failure, kept only as cause.
   */
  constructor(public readonly requirement: PlatformSecurityRequirement, options?: ErrorOptions) {
    super(`MessagingPlatformSecurity.read failed: ${requirement}`, options);
    this.name = "MessagingPlatformSecurityError";
  }
}
