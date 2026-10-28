/** Imports independent externally supplied keyrings into nonextractable Web Crypto keys. */
import "server-only";
import { MESSAGING_CRYPTO, MESSAGING_CRYPTO_ERROR, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import type { MessagingKeyPurpose } from "../../domain/value-objects/messaging-key-purpose";

export type { MessagingKeyPurpose } from "../../domain/value-objects/messaging-key-purpose";
export type MessagingKeyringInput = { activeKeyId: string; keys: { id: string; material: Uint8Array }[] };
export type MessagingKeyring = { purpose: MessagingKeyPurpose; activeKeyId: string; keys: ReadonlyMap<string, CryptoKey> };
export type MessagingSecurityConfig = {
  environment: string; securityEpoch: string; recoveryLocked: boolean;
  keyrings: Readonly<Record<MessagingKeyPurpose, MessagingKeyring>>;
};

/**
 * @param purpose - Fixed key purpose.
 * @param ring - Hosting-supplied keyring, possibly missing.
 * @param seenMaterial - Importer-owned copies of every key already imported, to reject reuse across purposes.
 * @returns The imported non-extractable keyring.
 * @throws MessagingCryptographyError for an incomplete, reused or inactive keyring.
 */
async function importKeyring(purpose: MessagingKeyPurpose, ring: MessagingKeyringInput | undefined, seenMaterial: Uint8Array[]): Promise<MessagingKeyring> {
  if (!ring?.activeKeyId || !ring.keys.length) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration);
  const keys = new Map<string, CryptoKey>();
  for (const entry of ring.keys) {
    if (!entry.id || keys.has(entry.id) || entry.material.byteLength !== MESSAGING_CRYPTO.keyBytes) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration);
    if (seenMaterial.some((material) => material.every((byte, index) => byte === entry.material[index]))) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.reusedKey);
    const material = Uint8Array.from(entry.material);
    seenMaterial.push(material);
    const encrypts = purpose === MESSAGING_KEY_PURPOSE.credential || purpose === MESSAGING_KEY_PURPOSE.otpEnvelope;
    const key = await crypto.subtle.importKey("raw", material,
      encrypts ? { name: MESSAGING_CRYPTO.aesAlgorithm } : { name: MESSAGING_CRYPTO.macAlgorithm, hash: MESSAGING_CRYPTO.macHash },
      false, encrypts ? ["encrypt", "decrypt"] : ["sign", "verify"]);
    keys.set(entry.id, key);
  }
  if (!keys.has(ring.activeKeyId)) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyUnavailable);
  return { purpose, activeKeyId: ring.activeKeyId, keys };
}

/**
 * Builds a private per-operation config from hosting-secret inputs, never database rows.
 *
 * Key ids are routing metadata, not key separation. Material must be independent
 * across all key ids and purposes. Keeping previous keys permits deliberate reads
 * during rotation; removing a key closes all envelopes/MACs referring to it.
 * No input material is returned, logged or persisted by this importer.
 *
 * @param input - External epoch/recovery state, deployment name and six keyrings.
 * @returns Nonextractable crypto keys separated by functional purpose.
 * @throws MessagingCryptographyError for unsafe or incomplete configuration.
 */
export async function createMessagingSecurityConfig(input: {
  environment: string; securityEpoch: string; recoveryLocked: boolean;
  keyrings: Record<MessagingKeyPurpose, MessagingKeyringInput>;
}): Promise<MessagingSecurityConfig> {
  if (!input.environment.trim() || !input.securityEpoch.trim() || typeof input.recoveryLocked !== "boolean") throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration);
  const seenMaterial: Uint8Array[] = [];
  const keyrings = {} as Record<MessagingKeyPurpose, MessagingKeyring>;
  // Hosting secrets are parsed at runtime: a purpose may still be missing.
  const inputRings: Partial<Record<MessagingKeyPurpose, MessagingKeyringInput>> = input.keyrings;
  try {
    for (const purpose of Object.values(MESSAGING_KEY_PURPOSE)) {
    keyrings[purpose] = await importKeyring(purpose, inputRings[purpose], seenMaterial);
    }
    return { environment: input.environment, securityEpoch: input.securityEpoch, recoveryLocked: input.recoveryLocked, keyrings };
  } finally {
    // Clear only importer-owned copies; externally supplied material remains
    // owned by the hosting-secret boundary that supplied this config.
    for (const material of seenMaterial) material.fill(0);
  }
}
