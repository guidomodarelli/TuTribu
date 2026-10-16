/** @vitest-environment node */
/** Exercises full-content integrity through real Web Crypto, not source text or provider mocks. @module admission-notification-email-intent-mac-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createMessagingSecurityConfig, type MessagingSecurityConfig, type MessagingKeyPurpose, type MessagingKeyringInput } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";
import { createNotificationRecoveryPayloadMac } from "@/src/modules/messaging/infrastructure/encryption/notification-recovery-payload-mac";
import { createAdmissionNotificationEmailIntentMac } from "@/src/modules/notifications/infrastructure/encryption/admission-notification-email-intent-mac";
import { createAdmissionNotificationEmailIntent } from "@/src/modules/notifications/domain/policies/admission-notification-email-content";
import type { AdmissionNotificationEmailIntentContext } from "@/src/modules/notifications/domain/entities/admission-notification-email-intent";

/** Stores only process-local synthetic nonextractable keys. */
let config: MessagingSecurityConfig;
beforeAll(async () => {
  const ring = (purpose: MessagingKeyPurpose): MessagingKeyringInput => ({ activeKeyId: purpose, keys: [{ id: purpose, material: randomBytes(MESSAGING_CRYPTO.keyBytes) }] });
  config = await createMessagingSecurityConfig({ environment: "synthetic-group", securityEpoch: "original-group-epoch", recoveryLocked: false, keyrings: { credential: ring("credential"), otp_envelope: ring("otp_envelope"), verification_mac: ring("verification_mac"), invitation_token: ring("invitation_token"), contact_fingerprint: ring("contact_fingerprint"), operation_payload: ring("operation_payload") } });
});

/** @returns One complete immutable private context with a transient synthetic destination and sub-millisecond clock values. */
function context(): AdmissionNotificationEmailIntentContext {
  const tribeId = randomUUID(), recipientUserId = randomUUID();
  return { tribeId, deliveryId: randomUUID(), originalDeliveryId: null, connectionId: randomUUID(), connectionVersion: 3, contributingLeaderUserId: randomUUID(), recipientUserId, normalizedRecipientEmail: "synthetic.current@example.invalid", idempotencyKey: randomUUID(), queuedUsagePolicyVersion: 2, createdAtMicroseconds: 1_791_979_200_123_456, deadlineAtMicroseconds: 1_792_065_600_000_001, intent: createAdmissionNotificationEmailIntent({ groupId: randomUUID(), groupVersion: 2, senderId: randomUUID(), href: "https://example.test/test/academia/admissions", manifest: { format: 1, identity: { tribeId, recipientUserId, audience: "reviewer", mode: "grouped", preferenceVersion: 0, emailSettingsVersion: 1, individualObligationId: null, window: { startsAtMicroseconds: 1_791_978_900_000_001, closesAtMicroseconds: 1_791_979_200_000_001, timeZone: "UTC" } }, items: [{ obligationId: randomUUID(), admissionRequestId: randomUUID(), event: "pending_created", createdAtMicroseconds: 1_791_979_200_000_001, deadlineAtMicroseconds: 1_792_065_600_000_001 }] } }) };
}

describe("complete grouped notification email integrity", () => {
  it("should authenticate every consumed field independently of PostgreSQL jsonb object order", async () => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), signed = await mac.sign(original);
    const reversed = Object.fromEntries(Object.entries(original.intent).reverse()) as AdmissionNotificationEmailIntentContext["intent"];
    expect(await mac.verify({ ...original, intent: { ...reversed, manifest: { ...reversed.manifest, identity: Object.fromEntries(Object.entries(reversed.manifest.identity).reverse()) as typeof reversed.manifest.identity } } }, signed)).toBe(true);
    expect(Object.keys(signed).sort()).toEqual(["keyId", "mac"]);
  });

  it.each(["tribeId", "deliveryId", "connectionId", "contributingLeaderUserId", "recipientUserId", "idempotencyKey"] as const)("should reject a changed original %s", async (field) => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), signed = await mac.sign(original);
    expect(await mac.verify({ ...original, [field]: randomUUID() }, signed)).toBe(false);
  });

  it.each(["connectionVersion", "queuedUsagePolicyVersion", "createdAtMicroseconds", "deadlineAtMicroseconds"] as const)("should reject a single-unit change of %s without Date truncation", async (field) => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), signed = await mac.sign(original);
    expect(await mac.verify({ ...original, [field]: original[field] + 1 }, signed)).toBe(false);
  });

  it.each(["groupId", "senderId", "subject", "text", "href", "kind", "channel"] as const)("should reject changed frozen %s content", async (field) => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), signed = await mac.sign(original);
    expect(await mac.verify({ ...original, intent: { ...original.intent, [field]: `${original.intent[field]}-changed` } }, signed)).toBe(false);
  });

  it.each(["format", "groupVersion"] as const)("should reject a changed frozen %s", async (field) => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), signed = await mac.sign(original);
    expect(await mac.verify({ ...original, intent: { ...original.intent, [field]: original.intent[field] + 1 } }, signed)).toBe(false);
  });

  it.each(["tribeId", "recipientUserId", "audience", "mode", "individualObligationId"] as const)("should reject a changed manifest identity %s", async (field) => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), signed = await mac.sign(original);
    const manifest = original.intent.manifest;
    expect(await mac.verify({ ...original, intent: { ...original.intent, manifest: { ...manifest, identity: { ...manifest.identity, [field]: "changed" } } } }, signed)).toBe(false);
  });

  it.each(["preferenceVersion", "emailSettingsVersion"] as const)("should reject a changed manifest %s", async (field) => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), signed = await mac.sign(original), manifest = original.intent.manifest;
    expect(await mac.verify({ ...original, intent: { ...original.intent, manifest: { ...manifest, identity: { ...manifest.identity, [field]: manifest.identity[field] + 1 } } } }, signed)).toBe(false);
  });

  it.each(["startsAtMicroseconds", "closesAtMicroseconds", "timeZone"] as const)("should reject a changed original window %s", async (field) => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), signed = await mac.sign(original), manifest = original.intent.manifest;
    const value = manifest.identity.window[field];
    expect(await mac.verify({ ...original, intent: { ...original.intent, manifest: { ...manifest, identity: { ...manifest.identity, window: { ...manifest.identity.window, [field]: typeof value === "number" ? value + 1 : "changed" } } } } }, signed)).toBe(false);
  });

  it.each(["obligationId", "admissionRequestId", "event", "createdAtMicroseconds", "deadlineAtMicroseconds"] as const)("should reject a changed frozen member %s", async (field) => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), signed = await mac.sign(original), manifest = original.intent.manifest, item = manifest.items[0], value = item[field];
    expect(await mac.verify({ ...original, intent: { ...original.intent, manifest: { ...manifest, items: [{ ...item, [field]: typeof value === "number" ? value + 1 : "changed" }] } } }, signed)).toBe(false);
  });

  it("should bind the current trusted email, lineage and complete member inventory without storing an address", async () => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), signed = await mac.sign(original);
    expect(await mac.verify({ ...original, normalizedRecipientEmail: "other@example.invalid" }, signed)).toBe(false);
    expect(await mac.verify({ ...original, originalDeliveryId: randomUUID() }, signed)).toBe(false);
    expect(await mac.verify({ ...original, intent: { ...original.intent, manifest: { ...original.intent.manifest, items: [] } } }, signed)).toBe(false);
    expect(JSON.stringify(original.intent)).not.toContain(original.normalizedRecipientEmail);
  });

  it("should close on recovery lock or missing retained keys and distinguish a new external epoch", async () => {
    const original = context(), signed = await createAdmissionNotificationEmailIntentMac(config).sign(original);
    await expect(createAdmissionNotificationEmailIntentMac({ ...config, recoveryLocked: true }).verify(original, signed)).rejects.toMatchObject({ code: "messaging_crypto_recovery_locked" });
    await expect(createAdmissionNotificationEmailIntentMac({ ...config, keyrings: { ...config.keyrings, operation_payload: { ...config.keyrings.operation_payload, keys: new Map() } } }).verify(original, signed)).rejects.toMatchObject({ code: "messaging_crypto_key_unavailable" });
    expect(await createAdmissionNotificationEmailIntentMac({ ...config, securityEpoch: "new-external-epoch" }).verify(original, signed)).toBe(false);
    expect(await createAdmissionNotificationEmailIntentMac({ ...config, environment: "different-host" }).verify(original, signed)).toBe(false);
  });

  it("should retain original key verification after active rotation without changing the legacy recovery format", async () => {
    const original = context(), signed = await createAdmissionNotificationEmailIntentMac(config).sign(original);
    const replacement = await crypto.subtle.generateKey({ name: MESSAGING_CRYPTO.macAlgorithm, hash: MESSAGING_CRYPTO.macHash }, false, ["sign", "verify"]);
    const rotated = { ...config, keyrings: { ...config.keyrings, operation_payload: { ...config.keyrings.operation_payload, activeKeyId: "new-payload-key", keys: new Map([...config.keyrings.operation_payload.keys, ["new-payload-key", replacement]]) } } };
    expect(await createAdmissionNotificationEmailIntentMac(rotated).verify(original, signed)).toBe(true);
    const next = await createAdmissionNotificationEmailIntentMac(rotated).sign(original);
    expect(next.keyId).toBe("new-payload-key");
    expect(await createAdmissionNotificationEmailIntentMac(rotated).verify(original, next)).toBe(true);
    expect(await createNotificationRecoveryPayloadMac(config).verify(signed.keyId, signed.mac, { tribeId: original.tribeId, deliveryId: original.deliveryId, originalDeliveryId: randomUUID(), connectionId: original.connectionId, connectionVersion: original.connectionVersion, obligationId: original.intent.groupId, recipientRef: original.recipientUserId, senderId: original.intent.senderId, createdAt: new Date("2026-10-16T12:00:00Z"), deadlineAt: new Date("2026-10-17T11:00:00Z") })).toBe(false);
  });

  it("should reject an unrepresentable native clock or an expired original lifetime before signing", async () => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config);
    await expect(mac.sign({ ...original, createdAtMicroseconds: Number.MAX_SAFE_INTEGER + 1 })).rejects.toMatchObject({ code: "messaging_crypto_context_mismatch" });
    await expect(mac.sign({ ...original, deadlineAtMicroseconds: original.createdAtMicroseconds })).rejects.toMatchObject({ code: "messaging_crypto_context_mismatch" });
  });
});
