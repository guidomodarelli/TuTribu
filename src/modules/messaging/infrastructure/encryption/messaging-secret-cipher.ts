/** Encrypts recoverable backend material with portable AES-GCM and exact authenticated scope. */
import "server-only";
import { MESSAGING_CRYPTO, MESSAGING_CRYPTO_ERROR, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MessagingCryptographyError } from "./messaging-cryptography-error";

export type MessagingSecretContext = { tribeId: string; connectionId: string; connectionVersion: number; resourceId: string };
export type MessagingCipherPurpose = "credential" | "otp_envelope";
export type MessagingSecretEnvelope = { format: number; purpose: MessagingCipherPurpose; environment: string; securityEpoch: string; keyId: string; iv: Uint8Array; ciphertext: Uint8Array };

/** Encodes an ordered tuple; JSON string escaping prevents ambiguous concatenation. */
function authenticatedData(config: MessagingSecurityConfig, purpose: MessagingCipherPurpose, keyId: string, context: MessagingSecretContext): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify([MESSAGING_CRYPTO.aadDomain, MESSAGING_CRYPTO.envelopeFormat, purpose, keyId, config.environment, config.securityEpoch, context.tribeId, context.connectionId, context.connectionVersion, context.resourceId]));
}

/** Rejects recovery and incomplete authorized resource context before selecting any key. */
function assertAuthorizedCryptoContext(config: MessagingSecurityConfig, context: MessagingSecretContext): void {
  if (config.recoveryLocked) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.recoveryLocked);
  if (!context.tribeId || !context.connectionId || !context.resourceId || !Number.isInteger(context.connectionVersion) || context.connectionVersion < 1) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.contextMismatch);
}

/**
 * Creates a per-operation cipher after the caller revalidates actor/resource authority.
 *
 * This primitive does not grant permission to read a secret. SecretStore must
 * resolve an authorized context and current retirement/epoch before invoking it.
 * Active-key writes and retained-key reads support encryption rotation without
 * changing the BYOK credential, counters or connection version.
 *
 * @param config - Private external keyrings and current recovery/epoch facts.
 * @param purpose - Credential or independent transient-OTP encryption purpose.
 * @returns An authenticated encryption boundary with no plaintext cache.
 */
export function createMessagingSecretCipher(config: MessagingSecurityConfig, purpose: MessagingCipherPurpose = MESSAGING_KEY_PURPOSE.credential) {
  const ring = config.keyrings[purpose];
  return {
    /** Encrypts one secret under a new cryptographic IV and the active key. */
    async seal(plaintext: string, context: MessagingSecretContext): Promise<MessagingSecretEnvelope> {
      assertAuthorizedCryptoContext(config, context);
      const key = ring.keys.get(ring.activeKeyId);
      if (!key) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyUnavailable);
      const iv = crypto.getRandomValues(new Uint8Array(MESSAGING_CRYPTO.ivBytes));
      const ciphertext = await crypto.subtle.encrypt({ name: MESSAGING_CRYPTO.aesAlgorithm, iv, additionalData: authenticatedData(config, purpose, ring.activeKeyId, context), tagLength: MESSAGING_CRYPTO.tagBits }, key, new TextEncoder().encode(plaintext));
      return { format: MESSAGING_CRYPTO.envelopeFormat, purpose, environment: config.environment, securityEpoch: config.securityEpoch, keyId: ring.activeKeyId, iv, ciphertext: new Uint8Array(ciphertext) };
    },
    /** Opens only an envelope authenticated for the current external and resource scope. */
    async open(envelope: MessagingSecretEnvelope, context: MessagingSecretContext): Promise<string> {
      assertAuthorizedCryptoContext(config, context);
      if (envelope.format !== MESSAGING_CRYPTO.envelopeFormat || envelope.purpose !== purpose || envelope.environment !== config.environment || envelope.securityEpoch !== config.securityEpoch || envelope.iv.byteLength !== MESSAGING_CRYPTO.ivBytes) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.contextMismatch);
      const key = ring.keys.get(envelope.keyId);
      if (!key) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyUnavailable);
      try {
        const plaintext = await crypto.subtle.decrypt({ name: MESSAGING_CRYPTO.aesAlgorithm, iv: Uint8Array.from(envelope.iv), additionalData: authenticatedData(config, purpose, envelope.keyId, context), tagLength: MESSAGING_CRYPTO.tagBits }, key, Uint8Array.from(envelope.ciphertext));
        return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
      } catch (error) {
        if (error instanceof DOMException && (error.name === "OperationError" || error.name === "DataError")) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.authenticationFailed, { cause: error });
        throw error;
      }
    },
  };
}
