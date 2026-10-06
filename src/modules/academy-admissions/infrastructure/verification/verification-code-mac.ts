/** Protects low-entropy codes with an independent keyed MAC and unambiguous challenge scope. */
import "server-only";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import type { VerificationCodeContext } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import { MESSAGING_CRYPTO, MESSAGING_CRYPTO_ERROR, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";

export type VerificationCodeMac = { keyId: string; mac: Uint8Array };
const VERIFICATION_CODE_CHARACTERS = /^\d+$/;

/** Encodes only the exact keyed verification tuple; it is never logged or persisted. */
function verificationData(code: string, keyId: string, context: VerificationCodeContext, config: MessagingSecurityConfig): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify([MESSAGING_CRYPTO.macDomain, keyId, config.environment, config.securityEpoch, context.challengeId, context.userId, context.tribeId, context.contact.type, context.contact.value, context.purpose, context.verificationEpoch, context.connectionId, context.connectionVersion, context.channel, context.createdAt.toISOString(), context.expiresAt.toISOString(), code]));
}

/** Checks only the submitted code grammar; validity and abuse limits belong to the locked writer. */
function isCodeFormatValid(code: string): boolean {
  return code.length === ADMISSION_LIMIT.verificationCodeDigits && VERIFICATION_CODE_CHARACTERS.test(code);
}

/**
 * Creates an independent OTP verifier, using subtle.verify for the MAC comparison.
 * @param config - Private verification keyring and current external security scope.
 * @returns MAC generation and verification; no raw key or code is retained.
 */
export function createVerificationCodeMac(config: MessagingSecurityConfig) {
  const ring = config.keyrings[MESSAGING_KEY_PURPOSE.verificationMac];
  const usableKey = (keyId: string) => {
    if (config.recoveryLocked) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.recoveryLocked);
    const key = ring.keys.get(keyId);
    if (!key) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyUnavailable);
    return key;
  };
  return {
    /** Signs a newly generated code using the active verification key. */
    async sign(code: string, context: VerificationCodeContext): Promise<VerificationCodeMac> {
      if (!isCodeFormatValid(code)) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration);
      const keyId = ring.activeKeyId;
      const mac = await crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm, usableKey(keyId), verificationData(code, keyId, context, config));
      return { keyId, mac: new Uint8Array(mac) };
    },
    /** Verifies a submitted code against its stored key id and exact current context. */
    async verify(code: string, stored: VerificationCodeMac, context: VerificationCodeContext): Promise<boolean> {
      if (!isCodeFormatValid(code)) return false;
      return crypto.subtle.verify(MESSAGING_CRYPTO.macAlgorithm, usableKey(stored.keyId), Uint8Array.from(stored.mac), verificationData(code, stored.keyId, context, config));
    },
  };
}
