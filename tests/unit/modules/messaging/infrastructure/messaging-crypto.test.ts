/** @vitest-environment node */

/** Exercises real Web Crypto, purpose isolation, authenticated context and OTP scope. */
import { beforeAll, describe, expect, it } from "vitest";
import { createMessagingSecurityConfig, type MessagingSecurityConfig, type MessagingKeyPurpose } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import { createVerificationCodeMac } from "@/src/modules/academy-admissions/infrastructure/verification/verification-code-mac";
import { generateVerificationCode } from "@/src/modules/academy-admissions/infrastructure/verification/web-crypto-code-generator";
import { createVerificationCodeEnvelope } from "@/src/modules/messaging/infrastructure/encryption/verification-code-envelope";
import type { VerificationCodeContext } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";

describe("messaging protected material", () => {
  let config: MessagingSecurityConfig;
  const purposes: MessagingKeyPurpose[] = ["credential", "otp_envelope", "verification_mac", "invitation_token", "contact_fingerprint", "operation_payload"];
  const keyrings = () => Object.fromEntries(purposes.map((purpose) => [purpose, { activeKeyId: `${purpose}-current`, keys: [{ id: `${purpose}-current`, material: crypto.getRandomValues(new Uint8Array(32)) }] }])) as Parameters<typeof createMessagingSecurityConfig>[0]["keyrings"];
  const context = { tribeId: "tribe-a", connectionId: "connection-a", connectionVersion: 1, resourceId: "secret-ref-a" };
  const challenge: VerificationCodeContext = { tribeId: context.tribeId, connectionId: context.connectionId, connectionVersion: context.connectionVersion, userId: "user-a", challengeId: "challenge-a", purpose: "admission", contact: { type: "email", value: "synthetic@example.test" }, verificationEpoch: 1, channel: "email", createdAt: new Date("2026-10-05T12:00:00.000Z"), expiresAt: new Date("2026-10-05T12:10:00.000Z") };
  beforeAll(async () => { config = await createMessagingSecurityConfig({ environment: "synthetic-local", securityEpoch: "epoch-a", recoveryLocked: false, keyrings: keyrings() }); });

  it("should round-trip credentials using distinct authenticated envelopes without recovering another scope", async () => {
    const cipher = createMessagingSecretCipher(config);
    const secret = crypto.randomUUID();
    const first = await cipher.seal(secret, context);
    const second = await cipher.seal(secret, context);
    expect(await cipher.open(first, context)).toBe(secret);
    expect(first.iv).not.toEqual(second.iv);
    expect(first.ciphertext).not.toEqual(second.ciphertext);
  });

  it.each(["tribe", "connection", "version", "resource", "key", "iv", "ciphertext", "epoch", "environment", "purpose"] as const)("should close decryption when %s differs from the authorized context", async (changed) => {
    const cipher = createMessagingSecretCipher(config);
    const envelope = await cipher.seal(crypto.randomUUID(), context);
    const currentContext = { ...context };
    if (changed === "tribe") currentContext.tribeId = "tribe-b";
    if (changed === "connection") currentContext.connectionId = "connection-b";
    if (changed === "version") currentContext.connectionVersion += 1;
    if (changed === "resource") currentContext.resourceId = "secret-ref-b";
    if (changed === "key") envelope.keyId = "retired-key";
    if (changed === "iv") envelope.iv[0] ^= 1;
    if (changed === "ciphertext") envelope.ciphertext[0] ^= 1;
    if (changed === "epoch") envelope.securityEpoch = "epoch-b";
    if (changed === "environment") envelope.environment = "other-environment";
    if (changed === "purpose") envelope.purpose = "otp_envelope";
    await expect(cipher.open(envelope, currentContext)).rejects.toMatchObject({ code: expect.stringMatching(/^messaging_crypto_/) });
  });

  it("should close encryption and decryption during an external recovery lock", async () => {
    const envelope = await createMessagingSecretCipher(config).seal(crypto.randomUUID(), context);
    const locked = createMessagingSecretCipher({ ...config, recoveryLocked: true });
    await expect(locked.open(envelope, context)).rejects.toMatchObject({ code: "messaging_crypto_recovery_locked" });
    await expect(locked.seal(crypto.randomUUID(), context)).rejects.toMatchObject({ code: "messaging_crypto_recovery_locked" });
  });

  it("should reject key reuse across independent purposes instead of treating ids as separation", async () => {
    const rings = keyrings();
    rings.otp_envelope.keys[0].material = rings.credential.keys[0].material;
    await expect(createMessagingSecurityConfig({ environment: "synthetic-local", securityEpoch: "epoch-a", recoveryLocked: false, keyrings: rings })).rejects.toMatchObject({ code: "messaging_crypto_key_reused" });
  });

  it("should reject an unknown active key or a key with the wrong strength", async () => {
    const rings = keyrings();
    rings.credential.activeKeyId = "missing-key";
    await expect(createMessagingSecurityConfig({ environment: "synthetic-local", securityEpoch: "epoch-a", recoveryLocked: false, keyrings: rings })).rejects.toMatchObject({ code: "messaging_crypto_key_unavailable" });
    const shortRings = keyrings();
    shortRings.credential.keys[0].material = crypto.getRandomValues(new Uint8Array(16));
    await expect(createMessagingSecurityConfig({ environment: "synthetic-local", securityEpoch: "epoch-a", recoveryLocked: false, keyrings: shortRings })).rejects.toMatchObject({ code: "messaging_crypto_configuration_invalid" });
  });

  it("should generate six-digit codes and verify their keyed scoped MAC without disclosing the code", async () => {
    const verifier = createVerificationCodeMac(config);
    for (let i = 0; i < 100; i += 1) {
      const code = generateVerificationCode();
      expect(code).toMatch(/^\d{6}$/);
      const stored = await verifier.sign(code, challenge);
      expect(await verifier.verify(code, stored, challenge)).toBe(true);
      expect(await verifier.verify(code === "000000" ? "999999" : "000000", stored, challenge)).toBe(false);
      expect(Object.keys(stored).sort()).toEqual(["keyId", "mac"]);
    }
  });

  it.each(["user", "tribe", "contact", "purpose", "challenge", "epoch", "connection", "version", "channel", "expiry"] as const)("should reject an OTP MAC reused with another %s", async (changed) => {
    const verifier = createVerificationCodeMac(config);
    const code = generateVerificationCode();
    const stored = await verifier.sign(code, challenge);
    const crossed = { ...challenge };
    if (changed === "user") crossed.userId = "user-b";
    if (changed === "tribe") crossed.tribeId = "tribe-b";
    if (changed === "contact") crossed.contact = { type: "email", value: "other@example.test" };
    if (changed === "purpose") crossed.purpose = "connection_diagnostic";
    if (changed === "challenge") crossed.challengeId = "challenge-b";
    if (changed === "epoch") crossed.verificationEpoch = 2;
    if (changed === "connection") crossed.connectionId = "connection-b";
    if (changed === "version") crossed.connectionVersion += 1;
    if (changed === "channel") crossed.channel = "sms";
    if (changed === "expiry") crossed.expiresAt = new Date(challenge.expiresAt.getTime() - 1);
    expect(await verifier.verify(code, stored, crossed)).toBe(false);
  });

  it("should never recover a transient OTP at or after its original ten-minute expiry", async () => {
    const protector = createVerificationCodeEnvelope(config);
    const now = challenge.createdAt;
    const code = generateVerificationCode();
    const envelope = await protector.seal(code, challenge, now);
    expect(await protector.open(envelope, challenge, now)).toBe(code);
    await expect(protector.open(envelope, challenge, challenge.expiresAt)).rejects.toMatchObject({ code: "messaging_crypto_material_expired" });
    await expect(protector.seal(code, { ...challenge, expiresAt: new Date(now.getTime() + 600_001) }, now)).rejects.toMatchObject({ code: "messaging_crypto_configuration_invalid" });
  });

  it("should read retained keys after rotation and close removed keys without changing the resource version", async () => {
    const rings = keyrings();
    const original = await createMessagingSecurityConfig({ environment: "synthetic-local", securityEpoch: "epoch-a", recoveryLocked: false, keyrings: rings });
    const envelope = await createMessagingSecretCipher(original).seal("synthetic-credential", context);
    rings.credential.keys.push({ id: "credential-next", material: crypto.getRandomValues(new Uint8Array(32)) });
    rings.credential.activeKeyId = "credential-next";
    const rotated = await createMessagingSecurityConfig({ environment: "synthetic-local", securityEpoch: "epoch-a", recoveryLocked: false, keyrings: rings });
    expect(await createMessagingSecretCipher(rotated).open(envelope, context)).toBe("synthetic-credential");
    expect((await createMessagingSecretCipher(rotated).seal("synthetic-credential", context)).keyId).toBe("credential-next");
    rings.credential.keys = rings.credential.keys.filter((key) => key.id === "credential-next");
    const retired = await createMessagingSecurityConfig({ environment: "synthetic-local", securityEpoch: "epoch-a", recoveryLocked: false, keyrings: rings });
    await expect(createMessagingSecretCipher(retired).open(envelope, context)).rejects.toMatchObject({ code: "messaging_crypto_key_unavailable" });
    expect(context.connectionVersion).toBe(1);
  });

  it("should import nonextractable keys and close a MAC across external restore epochs", async () => {
    for (const ring of Object.values(config.keyrings)) {
      for (const key of ring.keys.values()) await expect(crypto.subtle.exportKey("raw", key)).rejects.toMatchObject({ name: "InvalidAccessError" });
    }
    const code = generateVerificationCode();
    const stored = await createVerificationCodeMac(config).sign(code, challenge);
    expect(await createVerificationCodeMac({ ...config, securityEpoch: "epoch-after-restore" }).verify(code, stored, challenge)).toBe(false);
  });
});
