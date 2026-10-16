/** @vitest-environment node */
/** Exercises full-content integrity through real Web Crypto, not source text or provider mocks. @module admission-notification-email-intent-mac-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createMessagingSecurityConfig, type MessagingSecurityConfig, type MessagingKeyPurpose, type MessagingKeyringInput } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";
import { createNotificationRecoveryPayloadMac } from "@/src/modules/messaging/infrastructure/encryption/notification-recovery-payload-mac";
import { createAdmissionNotificationEmailIntentMac } from "@/src/modules/notifications/infrastructure/encryption/admission-notification-email-intent-mac";
import { createAdmissionNotificationEmailContent } from "@/src/modules/notifications/domain/policies/admission-notification-email-content";
import type { AdmissionNotificationEmailIntentContext, LegacyAdmissionNotificationEmailIntent } from "@/src/modules/notifications/domain/entities/admission-notification-email-intent";

/** Stores only process-local synthetic nonextractable keys. */
let config: MessagingSecurityConfig;
beforeAll(async () => {
  const ring = (purpose: MessagingKeyPurpose): MessagingKeyringInput => ({ activeKeyId: purpose, keys: [{ id: purpose, material: randomBytes(MESSAGING_CRYPTO.keyBytes) }] });
  config = await createMessagingSecurityConfig({ environment: "synthetic-group", securityEpoch: "original-group-epoch", recoveryLocked: false, keyrings: { credential: ring("credential"), otp_envelope: ring("otp_envelope"), verification_mac: ring("verification_mac"), invitation_token: ring("invitation_token"), contact_fingerprint: ring("contact_fingerprint"), operation_payload: ring("operation_payload") } });
});

describe("bound complete notification email integrity", () => {
  it("should authenticate a complete original after transient identities are discarded without granting current dispatch authority", async () => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config);
    const { intent: content, ...scope } = original;
    const sealed = await mac.seal({ ...scope, content });
    const { contributingLeaderUserId: _payer, normalizedRecipientEmail: _email, ...historicalScope } = scope;
    expect(await mac.verifyOriginal({ ...historicalScope, intent: sealed.intent }, sealed)).toBe(true);
    expect(await mac.verify({ ...scope, intent: sealed.intent }, sealed)).toBe(true);
    expect(await mac.verify({ ...scope, intent: sealed.intent, contributingLeaderUserId: "" }, sealed)).toBe(false);
    expect(await mac.verify({ ...scope, intent: sealed.intent, contributingLeaderUserId: randomUUID() }, sealed)).toBe(false);
    expect(await mac.verify({ ...scope, intent: sealed.intent, normalizedRecipientEmail: "new.current@example.invalid" }, sealed)).toBe(false);
    expect(sealed.intent.format).toBe(2);
    expect(JSON.stringify(sealed.intent)).not.toContain(scope.contributingLeaderUserId);
    expect(JSON.stringify(sealed.intent)).not.toContain(scope.normalizedRecipientEmail);
    expect(sealed.intent.payerBinding).not.toBe(sealed.intent.recipientBinding);
  });

  it("should snapshot every original content field before awaiting crypto and omit accidental personal metadata", async () => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config);
    const source = { ...original, content: { ...original.intent, privateNote: "private-recovery-canary", payerId: original.contributingLeaderUserId, destination: original.normalizedRecipientEmail, manifest: { ...original.intent.manifest, items: original.intent.manifest.items.map((item) => ({ ...item })) } } };
    const originalSubject = source.content.subject, originalObligation = source.content.manifest.items[0].obligationId;
    const completion = mac.seal(source);
    source.content.subject = "mutated-after-crypto-started";
    source.content.manifest.items[0].obligationId = randomUUID();
    source.contributingLeaderUserId = randomUUID();
    const sealed = await completion;
    expect(sealed.intent.subject).toBe(originalSubject);
    expect(sealed.intent.manifest.items[0].obligationId).toBe(originalObligation);
    expect(await mac.verify({ ...original, intent: sealed.intent }, sealed)).toBe(true);
    expect(JSON.stringify(sealed.intent)).not.toContain("private-recovery-canary");
    expect(JSON.stringify(sealed.intent)).not.toContain(original.normalizedRecipientEmail);
    expect(JSON.stringify(sealed.intent)).not.toContain(original.contributingLeaderUserId);
  });

  it.each(["tribeId", "deliveryId", "connectionId", "recipientUserId", "idempotencyKey"] as const)("should reject original bound scope changes to %s", async (field) => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), sealed = await mac.seal({ ...original, content: original.intent });
    expect(await mac.verifyOriginal({ ...original, intent: sealed.intent, [field]: randomUUID() }, sealed)).toBe(false);
  });

  it.each(["connectionVersion", "queuedUsagePolicyVersion", "createdAtMicroseconds", "deadlineAtMicroseconds"] as const)("should reject a single-unit change to bound %s", async (field) => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), sealed = await mac.seal({ ...original, content: original.intent });
    expect(await mac.verifyOriginal({ ...original, intent: sealed.intent, [field]: original[field] + 1 }, sealed)).toBe(false);
  });

  it.each(["groupId", "senderId", "subject", "text", "href", "payerBinding", "recipientBinding"] as const)("should reject changed bound %s even without the historical personal identities", async (field) => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), sealed = await mac.seal({ ...original, content: original.intent });
    expect(await mac.verifyOriginal({ ...original, intent: { ...sealed.intent, [field]: `${sealed.intent[field]}-changed` } }, sealed)).toBe(false);
  });

  it.each(["obligationId", "admissionRequestId", "event", "createdAtMicroseconds", "deadlineAtMicroseconds"] as const)("should authenticate every bound frozen member %s", async (field) => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), sealed = await mac.seal({ ...original, content: original.intent });
    const manifest = sealed.intent.manifest, item = manifest.items[0], value = item[field];
    expect(await mac.verifyOriginal({ ...original, intent: { ...sealed.intent, manifest: { ...manifest, items: [{ ...item, [field]: typeof value === "number" ? value + 1 : "changed" }] } } }, sealed)).toBe(false);
  });

  it("should reject missing, reordered and substituted original members and preserve JSON object-order independence", async () => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config);
    const content = { ...original.intent, manifest: { ...original.intent.manifest, items: [...original.intent.manifest.items, { ...original.intent.manifest.items[0], obligationId: randomUUID(), admissionRequestId: randomUUID() }] } };
    const sealed = await mac.seal({ ...original, content }), manifest = sealed.intent.manifest;
    expect(await mac.verifyOriginal({ ...original, intent: { ...sealed.intent, manifest: { ...manifest, items: manifest.items.slice(0, 1) } } }, sealed)).toBe(false);
    expect(await mac.verifyOriginal({ ...original, intent: { ...sealed.intent, manifest: { ...manifest, items: [...manifest.items].reverse() } } }, sealed)).toBe(false);
    const reordered = Object.fromEntries(Object.entries(sealed.intent).reverse()) as typeof sealed.intent;
    expect(await mac.verifyOriginal({ ...original, intent: reordered }, sealed)).toBe(true);
    expect(await mac.verifyOriginal({ ...original, intent: sealed.intent, originalDeliveryId: randomUUID() }, sealed)).toBe(false);
  });

  it("should issue distinct target bindings while preserving original content and deadline during explicit recovery", async () => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), sealed = await mac.seal({ ...original, content: original.intent });
    const target = { ...original, deliveryId: randomUUID(), originalDeliveryId: original.deliveryId, connectionId: randomUUID(), connectionVersion: original.connectionVersion + 1, contributingLeaderUserId: randomUUID(), normalizedRecipientEmail: "new.current@example.invalid", createdAtMicroseconds: original.createdAtMicroseconds + 1 };
    const recovered = await mac.seal({ ...target, content: { ...sealed.intent, senderId: "new-tested-sender" } });
    expect(await mac.verify({ ...target, intent: recovered.intent }, recovered)).toBe(true);
    expect(recovered.intent.manifest).toEqual(sealed.intent.manifest);
    expect({ subject: recovered.intent.subject, text: recovered.intent.text, href: recovered.intent.href }).toEqual({ subject: sealed.intent.subject, text: sealed.intent.text, href: sealed.intent.href });
    expect(recovered.intent.payerBinding).not.toBe(sealed.intent.payerBinding);
    expect(recovered.intent.recipientBinding).not.toBe(sealed.intent.recipientBinding);
    expect(await mac.verifyOriginal({ ...target, intent: { ...recovered.intent, payerBinding: sealed.intent.payerBinding } }, recovered)).toBe(false);
    expect(await mac.verifyOriginal({ ...target, intent: { ...recovered.intent, recipientBinding: sealed.intent.recipientBinding } }, recovered)).toBe(false);
    await expect(mac.sign({ ...target, intent: recovered.intent })).rejects.toMatchObject({ code: "messaging_crypto_context_mismatch" });
  });

  it("should distinguish bound originals from legacy full-content and reference-only recovery protocols", async () => {
    const original = context(), mac = createAdmissionNotificationEmailIntentMac(config), legacy = await mac.sign(original), sealed = await mac.seal({ ...original, content: original.intent });
    expect(await mac.verify({ ...original, intent: sealed.intent }, legacy)).toBe(false);
    expect(await mac.verify(original, sealed)).toBe(false);
    expect(await mac.verify({ ...original, contributingLeaderUserId: "" }, legacy)).toBe(false);
  });

  it("should retain bound history after key rotation and close missing, replaced, locked or foreign scope material", async () => {
    const original = context(), sealed = await createAdmissionNotificationEmailIntentMac(config).seal({ ...original, content: original.intent });
    const replacement = await crypto.subtle.generateKey({ name: MESSAGING_CRYPTO.macAlgorithm, hash: MESSAGING_CRYPTO.macHash }, false, ["sign", "verify"]);
    const rotated = { ...config, keyrings: { ...config.keyrings, operation_payload: { ...config.keyrings.operation_payload, activeKeyId: "next-bound-key", keys: new Map([...config.keyrings.operation_payload.keys, ["next-bound-key", replacement]]) } } };
    expect(await createAdmissionNotificationEmailIntentMac(rotated).verifyOriginal({ ...original, intent: sealed.intent }, sealed)).toBe(true);
    expect(await createAdmissionNotificationEmailIntentMac(rotated).verify({ ...original, intent: sealed.intent }, sealed)).toBe(true);
    const resealed = await createAdmissionNotificationEmailIntentMac(rotated).seal({ ...original, content: sealed.intent });
    expect(resealed.keyId).toBe("next-bound-key");
    expect(await createAdmissionNotificationEmailIntentMac(rotated).verify({ ...original, intent: resealed.intent }, resealed)).toBe(true);
    expect(await createAdmissionNotificationEmailIntentMac({ ...config, environment: "foreign-bound-environment" }).verifyOriginal({ ...original, intent: sealed.intent }, sealed)).toBe(false);
    expect(await createAdmissionNotificationEmailIntentMac({ ...config, securityEpoch: "foreign-bound-epoch" }).verifyOriginal({ ...original, intent: sealed.intent }, sealed)).toBe(false);
    expect(await createAdmissionNotificationEmailIntentMac({ ...config, keyrings: { ...config.keyrings, operation_payload: { ...config.keyrings.operation_payload, keys: new Map([[sealed.keyId, replacement]]) } } }).verifyOriginal({ ...original, intent: sealed.intent }, sealed)).toBe(false);
    await expect(createAdmissionNotificationEmailIntentMac({ ...config, recoveryLocked: true }).verifyOriginal({ ...original, intent: sealed.intent }, sealed)).rejects.toMatchObject({ code: "messaging_crypto_recovery_locked" });
    await expect(createAdmissionNotificationEmailIntentMac({ ...config, keyrings: { ...config.keyrings, operation_payload: { ...config.keyrings.operation_payload, keys: new Map() } } }).verifyOriginal({ ...original, intent: sealed.intent }, sealed)).rejects.toMatchObject({ code: "messaging_crypto_key_unavailable" });
  });
});

/** @returns One complete immutable private context with a transient synthetic destination and sub-millisecond clock values. */
function context(): AdmissionNotificationEmailIntentContext & { intent: LegacyAdmissionNotificationEmailIntent } {
  const tribeId = randomUUID(), recipientUserId = randomUUID();
  return { tribeId, deliveryId: randomUUID(), originalDeliveryId: null, connectionId: randomUUID(), connectionVersion: 3, contributingLeaderUserId: randomUUID(), recipientUserId, normalizedRecipientEmail: "synthetic.current@example.invalid", idempotencyKey: randomUUID(), queuedUsagePolicyVersion: 2, createdAtMicroseconds: 1_791_979_200_123_456, deadlineAtMicroseconds: 1_792_065_600_000_001, intent: { format: 1, ...createAdmissionNotificationEmailContent({ groupId: randomUUID(), groupVersion: 2, senderId: randomUUID(), href: "https://example.test/test/academia/admissions", manifest: { format: 1, identity: { tribeId, recipientUserId, audience: "reviewer", mode: "grouped", preferenceVersion: 0, emailSettingsVersion: 1, individualObligationId: null, window: { startsAtMicroseconds: 1_791_978_900_000_001, closesAtMicroseconds: 1_791_979_200_000_001, timeZone: "UTC" } }, items: [{ obligationId: randomUUID(), admissionRequestId: randomUUID(), event: "pending_created", createdAtMicroseconds: 1_791_979_200_000_001, deadlineAtMicroseconds: 1_792_065_600_000_001 }] } }) } };
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
