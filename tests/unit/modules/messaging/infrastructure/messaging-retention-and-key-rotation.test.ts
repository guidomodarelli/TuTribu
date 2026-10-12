/** @vitest-environment node */
/** Exercises independent native payload key rotation without changing cipher identity or immutable delivery lifetimes. @module messaging-retention-and-key-rotation-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMessagingSecurityConfig, type MessagingKeyPurpose, type MessagingKeyringInput } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { createVerificationDeliveryPayloadMac, type VerificationDeliveryPayloadContext } from "@/src/modules/messaging/infrastructure/encryption/verification-delivery-payload-mac";
import { createNotificationRecoveryPayloadMac, type NotificationRecoveryPayloadContext } from "@/src/modules/messaging/infrastructure/encryption/notification-recovery-payload-mac";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

/** @returns Three native nonextractable configurations sharing identity/cipher keys and differing only in payload-key retention. */
async function rotationFixture() {
  /** @returns One independent generated keyring without shared material. */
  const createKeyring = (): MessagingKeyringInput => { const id = randomUUID(); return { activeKeyId: id, keys: [{ id, material: randomBytes(MESSAGING_CRYPTO.keyBytes) }] }; };
  const keyrings = { credential: createKeyring(), otp_envelope: createKeyring(), verification_mac: createKeyring(), invitation_token: createKeyring(), contact_fingerprint: createKeyring(), operation_payload: createKeyring() } satisfies Record<MessagingKeyPurpose, MessagingKeyringInput>;
  const originalPayload = keyrings.operation_payload, nextKeyId = randomUUID(), nextMaterial = randomBytes(MESSAGING_CRYPTO.keyBytes);
  const scope = { environment: "synthetic-retention-rotation", securityEpoch: randomUUID(), recoveryLocked: false };
  const original = await createMessagingSecurityConfig({ ...scope, keyrings });
  const retained = await createMessagingSecurityConfig({ ...scope, keyrings: { ...keyrings, operation_payload: { activeKeyId: nextKeyId, keys: [...originalPayload.keys, { id: nextKeyId, material: nextMaterial }] } } });
  const retired = await createMessagingSecurityConfig({ ...scope, keyrings: { ...keyrings, operation_payload: { activeKeyId: nextKeyId, keys: [{ id: nextKeyId, material: nextMaterial }] } } });
  return { original, retained, retired, nextKeyId };
}

describe("native payload key rotation contracts", () => {
  it.each(["verification", "notification"] as const)("should preserve the original %s payload through retained-key rotation and close a removed key without fallback", async (purpose) => {
    const fixture = await rotationFixture();
    const createdAt = new Date("2026-10-12T07:00:00Z"), deadlineAt = new Date("2026-10-12T07:10:00Z");
    const common = { tribeId: randomUUID(), connectionId: randomUUID(), connectionVersion: 1, deliveryId: randomUUID(), createdAt };
    if (purpose === "verification") {
      const challengeId = randomUUID();
      const context: VerificationDeliveryPayloadContext = { ...common, challengeId, diagnosticId: null, contactSubjectId: randomUUID(), fingerprintKeyId: fixture.original.keyrings.contact_fingerprint.activeKeyId, contactFingerprint: randomBytes(MESSAGING_CRYPTO.keyBytes), frozenIntent: { format: 1, challengeId, deliveryId: common.deliveryId, envelopeId: randomUUID(), senderId: randomUUID(), templateId: null, templateLanguage: null, channel: "email", purpose: "admission" }, expiresAt: deadlineAt };
      const signed = await createVerificationDeliveryPayloadMac(fixture.original).sign(context);
      expect(await createVerificationDeliveryPayloadMac(fixture.retained).verify(context, signed)).toBe(true);
      const newlySigned = await createVerificationDeliveryPayloadMac(fixture.retained).sign(context);
      expect(newlySigned.keyId).toBe(fixture.nextKeyId);
      expect(await createVerificationDeliveryPayloadMac(fixture.retired).verify(context, newlySigned)).toBe(true);
      await expect(createVerificationDeliveryPayloadMac(fixture.retired).verify(context, signed)).rejects.toMatchObject({ code: "messaging_crypto_key_unavailable" });
      expect(await createVerificationDeliveryPayloadMac(fixture.retained).verify({ ...context, expiresAt: new Date("2026-10-12T07:11:00Z") }, signed)).toBe(false);
    } else {
      const context: NotificationRecoveryPayloadContext = { ...common, originalDeliveryId: randomUUID(), obligationId: randomUUID(), recipientRef: randomUUID(), senderId: randomUUID(), deadlineAt };
      const signed = await createNotificationRecoveryPayloadMac(fixture.original).sign(context);
      expect(await createNotificationRecoveryPayloadMac(fixture.retained).verify(signed.keyId, signed.mac, context)).toBe(true);
      const newlySigned = await createNotificationRecoveryPayloadMac(fixture.retained).sign(context);
      expect(newlySigned.keyId).toBe(fixture.nextKeyId);
      expect(await createNotificationRecoveryPayloadMac(fixture.retired).verify(newlySigned.keyId, newlySigned.mac, context)).toBe(true);
      await expect(createNotificationRecoveryPayloadMac(fixture.retired).verify(signed.keyId, signed.mac, context)).rejects.toMatchObject({ code: "messaging_crypto_key_unavailable" });
      expect(await createNotificationRecoveryPayloadMac(fixture.retained).verify(signed.keyId, signed.mac, { ...context, deadlineAt: new Date("2026-10-12T07:11:00Z") })).toBe(false);
    }
    expect(fixture.retained.environment).toBe(fixture.original.environment);
    expect(fixture.retained.securityEpoch).toBe(fixture.original.securityEpoch);
    expect(fixture.retained.keyrings.contact_fingerprint.activeKeyId).toBe(fixture.original.keyrings.contact_fingerprint.activeKeyId);
    expect(fixture.retained.keyrings[MESSAGING_KEY_PURPOSE.credential].activeKeyId).toBe(fixture.original.keyrings[MESSAGING_KEY_PURPOSE.credential].activeKeyId);
    const privateCredential = randomUUID(), cipherScope = { ...common, resourceId: randomUUID() };
    const envelope = await createMessagingSecretCipher(fixture.original).seal(privateCredential, cipherScope);
    expect(await createMessagingSecretCipher(fixture.retired).open(envelope, cipherScope) === privateCredential).toBe(true);
    expect(envelope.keyId).toBe(fixture.original.keyrings.credential.activeKeyId);
  });
});
