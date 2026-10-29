/** @vitest-environment node */
/** Exercises real Web Crypto recovery integrity and the minimum owned public DTO. @module notification-recovery-payload-contract-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createNotificationRecoveryPayloadMac, type NotificationRecoveryPayloadContext } from "@/src/modules/messaging/infrastructure/encryption/notification-recovery-payload-mac";
import { createMessagingSecurityConfig, type MessagingKeyPurpose, type MessagingKeyringInput } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { notificationDeliveryRecoveryResultSchema } from "@/src/modules/messaging/constants/notification-delivery-recovery-schema";

/** @returns Independent nonextractable native keys and one immutable private recovery tuple. */
async function preparePayload() {
  const createKeyring = (purpose: MessagingKeyPurpose): MessagingKeyringInput => ({ activeKeyId: purpose, keys: [{ id: purpose, material: randomBytes(MESSAGING_CRYPTO.keyBytes) }] });
  const keyrings = {
    credential: createKeyring(MESSAGING_KEY_PURPOSE.credential),
    otp_envelope: createKeyring(MESSAGING_KEY_PURPOSE.otpEnvelope),
    verification_mac: createKeyring(MESSAGING_KEY_PURPOSE.verificationMac),
    invitation_token: createKeyring(MESSAGING_KEY_PURPOSE.invitationToken),
    contact_fingerprint: createKeyring(MESSAGING_KEY_PURPOSE.contactFingerprint),
    operation_payload: createKeyring(MESSAGING_KEY_PURPOSE.operationPayload),
  } satisfies Record<MessagingKeyPurpose, MessagingKeyringInput>;
  const config = await createMessagingSecurityConfig({ environment: "synthetic-recovery", securityEpoch: "original-epoch", recoveryLocked: false, keyrings });
  const context: NotificationRecoveryPayloadContext = { tribeId: randomUUID(), deliveryId: randomUUID(), originalDeliveryId: randomUUID(), connectionId: randomUUID(), connectionVersion: 3, obligationId: randomUUID(), recipientRef: randomUUID(), senderId: randomUUID(), createdAt: new Date("2026-10-11T07:00:00Z"), deadlineAt: new Date("2026-10-11T08:00:00Z") };
  return { config, context, mac: createNotificationRecoveryPayloadMac(config) };
}

describe("notification recovery payload integrity", () => {
  it("should authenticate the exact original lineage and reject a different security epoch", async () => {
    const fixture = await preparePayload();
    const signed = await fixture.mac.sign(fixture.context);
    expect(await fixture.mac.verify(signed.keyId, signed.mac, fixture.context)).toBe(true);
    const changed = createNotificationRecoveryPayloadMac({ ...fixture.config, securityEpoch: "changed-epoch" });
    expect(await changed.verify(signed.keyId, signed.mac, fixture.context)).toBe(false);
  });

  it.each(["tribeId", "deliveryId", "originalDeliveryId", "connectionId", "obligationId", "recipientRef", "senderId"] as const)("should reject a changed immutable %s", async (field) => {
    const fixture = await preparePayload();
    const signed = await fixture.mac.sign(fixture.context);
    expect(await fixture.mac.verify(signed.keyId, signed.mac, { ...fixture.context, [field]: randomUUID() })).toBe(false);
  });

  it("should reject changes to the fixed version and original lifetime", async () => {
    const fixture = await preparePayload();
    const signed = await fixture.mac.sign(fixture.context);
    expect(await fixture.mac.verify(signed.keyId, signed.mac, { ...fixture.context, connectionVersion: 4 })).toBe(false);
    expect(await fixture.mac.verify(signed.keyId, signed.mac, { ...fixture.context, deadlineAt: new Date("2026-10-11T09:00:00Z") })).toBe(false);
  });

  it("should close sign and verification when external recovery is locked", async () => {
    const fixture = await preparePayload();
    const signed = await fixture.mac.sign(fixture.context);
    const locked = createNotificationRecoveryPayloadMac({ ...fixture.config, recoveryLocked: true });
    await expect(locked.sign(fixture.context)).rejects.toMatchObject({ code: "messaging_crypto_recovery_locked" });
    await expect(locked.verify(signed.keyId, signed.mac, fixture.context)).rejects.toMatchObject({ code: "messaging_crypto_recovery_locked" });
  });
});

describe("owned notification recovery result", () => {
  it("should accept only minimum committed lineage metadata", () => {
    const result = { originalDeliveryId: randomUUID(), recoveryDeliveryId: randomUUID(), originalVersion: 2, targetConnectionId: randomUUID(), targetConnectionVersion: 3 };
    expect(notificationDeliveryRecoveryResultSchema.parse(result)).toEqual(result);
    expect(notificationDeliveryRecoveryResultSchema.safeParse({ ...result, recipient: "synthetic@example.test" }).success).toBe(false);
    expect(notificationDeliveryRecoveryResultSchema.safeParse({ ...result, secretRef: randomUUID() }).success).toBe(false);
    expect(notificationDeliveryRecoveryResultSchema.safeParse({ ...result, frozenIntent: {} }).success).toBe(false);
    expect(notificationDeliveryRecoveryResultSchema.safeParse({ ...result, targetConnectionVersion: 0 }).success).toBe(false);
  });
});
