/** Protects the exact immutable verification-delivery tuple without storing plaintext code or credentials. @module verification-delivery-payload-mac */
import "server-only";
import { VERIFICATION_FROZEN_PAYLOAD_DOMAIN } from "@/src/modules/academy-admissions/constants/verification-issuance";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE, MESSAGING_CRYPTO_ERROR } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MessagingCryptographyError } from "./messaging-cryptography-error";

/** Encodes the original platform fingerprint as lowercase hexadecimal, two digits per byte. */
const FINGERPRINT_HEX_RADIX = 16;
const FINGERPRINT_HEX_BYTE_WIDTH = 2;

/** Contains only the original private scope, references and protected contact index. */
export type VerificationDeliveryPayloadContext = { tribeId: string; connectionId: string; connectionVersion: number; challengeId: string; diagnosticId: string | null; deliveryId: string; contactSubjectId: string; fingerprintKeyId: string; contactFingerprint: Uint8Array; frozenIntent: Readonly<Record<string, unknown>>; createdAt: Date; expiresAt: Date };

/** @param keyId - Exact active/retained payload key. @param context - Original immutable delivery tuple. @param config - Current external scope. @returns Unambiguous own MAC bytes. */
function data(keyId: string, context: VerificationDeliveryPayloadContext, config: MessagingSecurityConfig): Uint8Array<ArrayBuffer> {
  const fingerprint = Array.from(context.contactFingerprint, (byte) => byte.toString(FINGERPRINT_HEX_RADIX).padStart(FINGERPRINT_HEX_BYTE_WIDTH,"0")).join("");
  // Preserve the original producer's format-1 order after PostgreSQL jsonb reorders object keys.
  const frozen = context.frozenIntent;
  const originalIntent = { format: frozen.format, challengeId: frozen.challengeId, deliveryId: frozen.deliveryId, envelopeId: frozen.envelopeId, senderId: frozen.senderId, templateId: frozen.templateId, templateLanguage: frozen.templateLanguage, channel: frozen.channel, purpose: frozen.purpose };
  return new TextEncoder().encode(JSON.stringify([VERIFICATION_FROZEN_PAYLOAD_DOMAIN,keyId,config.environment,config.securityEpoch,context.tribeId,context.connectionId,context.connectionVersion,context.challengeId,context.diagnosticId,context.deliveryId,context.contactSubjectId,context.fingerprintKeyId,fingerprint,originalIntent,context.createdAt.toISOString(),context.expiresAt.toISOString()]));
}

/**
 * Uses active-key writes and retained-key reads for the original private payload, never a fresh retry intent.
 * @param config - External recovery/epoch and nonextractable platform keyring.
 * @returns Sign/verify operations without a plaintext or mutable client cache.
 */
export function createVerificationDeliveryPayloadMac(config: MessagingSecurityConfig) {
  const ring = config.keyrings[MESSAGING_KEY_PURPOSE.operationPayload];
  const key = (keyId: string) => {
    if (config.recoveryLocked) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.recoveryLocked);
    const current = ring.keys.get(keyId);
    if (!current) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.keyUnavailable);
    return current;
  };
  return {
    /** @param context - Original immutable tuple. @returns Active key id and MAC, without secret material. */
    async sign(context: VerificationDeliveryPayloadContext) { const keyId = ring.activeKeyId; return { keyId, mac: new Uint8Array(await crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm,key(keyId),data(keyId,context,config))) }; },
    /** @param context - Exact stored original tuple. @param stored - Stored key id and protected fingerprint. @returns Constant-time verification, closed for unknown/retired keys. */
    async verify(context: VerificationDeliveryPayloadContext, stored: { keyId: string; mac: Uint8Array }): Promise<boolean> { return crypto.subtle.verify(MESSAGING_CRYPTO.macAlgorithm,key(stored.keyId),Uint8Array.from(stored.mac),data(stored.keyId,context,config)); },
  };
}
