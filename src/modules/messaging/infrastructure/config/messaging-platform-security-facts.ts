/** Reads the live security facts a sensitive messaging operation is bound to, typing a platform failure before any effect. @module messaging-platform-security-facts */
import "server-only";
import type { MessagingSecurityFacts } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { MessagingPlatformSecurityError } from "@/src/modules/messaging/domain/errors/messaging-platform-security-error";
import type { MessagingSecurityConfig } from "./messaging-security-config";
import { classifyMessagingPlatformSecurityFailure } from "./messaging-platform-security-failure";

/**
 * @param readSecurityConfig - Live hosting security snapshot, the same one the operation later signs and seals with.
 * @returns Its environment, epoch and recovery state, without returning or retaining any key.
 * @throws MessagingPlatformSecurityError, with the original failure as cause, when the platform cannot protect the operation;
 * any other failure propagates unchanged.
 */
export async function readMessagingPlatformSecurityFacts(readSecurityConfig: () => Promise<MessagingSecurityConfig>): Promise<MessagingSecurityFacts> {
  let current: MessagingSecurityConfig;
  try { current = await readSecurityConfig(); }
  catch (error) {
    const requirement = classifyMessagingPlatformSecurityFailure(error);
    if (requirement) throw new MessagingPlatformSecurityError(requirement, { cause: error });
    throw error;
  }
  return { environment: current.environment, securityEpoch: current.securityEpoch, recoveryLocked: current.recoveryLocked };
}
