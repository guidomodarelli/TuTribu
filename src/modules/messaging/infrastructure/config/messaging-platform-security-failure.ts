/** Tells a platform-owned messaging security failure from every other closed cryptographic outcome. @module messaging-platform-security-failure */
import "server-only";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import { PLATFORM_SECURITY_REQUIREMENT } from "@/src/modules/shared/constants/platform-security";
import { MESSAGING_CRYPTO_ERROR } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MessagingCryptographyError } from "../encryption/messaging-cryptography-error";

/**
 * Hosting security failures only the TuTribu team can fix: missing or unusable settings, keys reused across purposes,
 * an active key outside its keyring, and keys whose immutable proof is not enrolled (absent, or rotated without enrolling).
 */
const UNCONFIGURED_SECURITY_FAILURES: ReadonlySet<MessagingCryptographyError["code"]> = new Set([
  MESSAGING_CRYPTO_ERROR.invalidConfiguration, MESSAGING_CRYPTO_ERROR.reusedKey,
  MESSAGING_CRYPTO_ERROR.keyUnavailable, MESSAGING_CRYPTO_ERROR.keyContinuityUnproven,
]);

/**
 * @param error - Any failure seen while reading the hosting messaging security or attesting its keys.
 * @returns The platform requirement it proves, or null for another failure (for example a native identity that is not
 * current, a failed authentication, or anything that is not a {@link MessagingCryptographyError}).
 */
export function classifyMessagingPlatformSecurityFailure(error: unknown): PlatformSecurityRequirement | null {
  if (!(error instanceof MessagingCryptographyError)) return null;
  if (error.code === MESSAGING_CRYPTO_ERROR.recoveryLocked) return PLATFORM_SECURITY_REQUIREMENT.recoveryLocked;
  return UNCONFIGURED_SECURITY_FAILURES.has(error.code) ? PLATFORM_SECURITY_REQUIREMENT.unconfigured : null;
}
