/** Bounds recoverable OTP material to the original challenge and its ten-minute lifetime. */
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import type { VerificationCodeContext } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import { MESSAGING_CRYPTO_ERROR, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MessagingCryptographyError } from "./messaging-cryptography-error";
import { createMessagingSecretCipher, type MessagingSecretContext, type MessagingSecretEnvelope } from "./messaging-secret-cipher";

/** Uses the full challenge tuple as authenticated resource identity without storing plaintext. */
function envelopeContext(context: VerificationCodeContext): MessagingSecretContext {
  return { tribeId: context.tribeId, connectionId: context.connectionId, connectionVersion: context.connectionVersion,
    resourceId: JSON.stringify([context.challengeId, context.userId, context.contact.type, context.contact.value, context.purpose, context.verificationEpoch, context.channel, context.createdAt.toISOString(), context.expiresAt.toISOString()]),
  };
}

/** Rejects an extended deadline or unusable temporal material before any cipher operation. */
function assertChallengeLifetime(context: VerificationCodeContext, now: Date): void {
  const lifetimeMs = context.expiresAt.getTime() - context.createdAt.getTime();
  if (!Number.isFinite(lifetimeMs) || lifetimeMs <= 0 || lifetimeMs > ADMISSION_LIMIT.verificationCodeValidityMs || !Number.isFinite(now.getTime())) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration);
  if (now.getTime() < context.createdAt.getTime() || now.getTime() >= context.expiresAt.getTime()) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.materialExpired);
}

/**
 * Creates a transient code protector with a keyring independent of API credentials.
 *
 * Persistence must purge the envelope after dispatch/invalidating the challenge;
 * this primitive closes recovery at its deadline even if cleanup has not run.
 *
 * @param config - Current external epoch/recovery and independent OTP keyring.
 * @returns Deadline-checked authenticated encryption without a material cache.
 */
export function createVerificationCodeEnvelope(config: MessagingSecurityConfig) {
  const cipher = createMessagingSecretCipher(config, MESSAGING_KEY_PURPOSE.otpEnvelope);
  return {
    /** Protects a generated code for its original challenge, never an extended resend. */
    async seal(code: string, context: VerificationCodeContext, now: Date): Promise<MessagingSecretEnvelope> {
      assertChallengeLifetime(context, now);
      return cipher.seal(code, envelopeContext(context));
    },
    /** Recovers a code only while the authorized original challenge remains timely. */
    async open(envelope: MessagingSecretEnvelope, context: VerificationCodeContext, now: Date): Promise<string> {
      assertChallengeLifetime(context, now);
      return cipher.open(envelope, envelopeContext(context));
    },
  };
}
