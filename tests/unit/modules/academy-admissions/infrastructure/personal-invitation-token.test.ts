/** @vitest-environment node */
/** Exercises real Web Crypto token issuance, retained-key verification and nonrecoverability. @module personal-invitation-token-tests */
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createPersonalInvitationTokenCodec } from "@/src/modules/academy-admissions/infrastructure/tokens/personal-invitation-token";
import { createMessagingSecurityConfig, type MessagingSecurityConfig, type MessagingKeyringInput } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

describe("personal invitation opaque tokens", () => {
  let config: MessagingSecurityConfig;
  beforeAll(async () => {
    const keyring = (purpose: string): MessagingKeyringInput => ({ activeKeyId: `${purpose}-current`, keys: [{ id: `${purpose}-current`, material: randomBytes(32) }] });
    config = await createMessagingSecurityConfig({ environment: "synthetic-personal-token", securityEpoch: "synthetic-epoch", recoveryLocked: false, keyrings: { credential: keyring("credential"), otp_envelope: keyring("otp_envelope"), verification_mac: keyring("verification_mac"), invitation_token: keyring("invitation_token"), contact_fingerprint: keyring("contact_fingerprint"), operation_payload: keyring("operation_payload") } });
  });
  it("should issue independent canonical 256-bit tokens and return only a digest/key reference suitable for storage", async () => {
    const codec = createPersonalInvitationTokenCodec(config), context = { tribeId: "synthetic-tribe", invitationId: "synthetic-invitation" };
    const first = await codec.issue(context), second = await codec.issue(context);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/u); expect(second.token).not.toBe(first.token);
    expect(first.digest.byteLength).toBe(32); expect(first.digest).not.toEqual(second.digest);
    expect(first.lookupDigest.byteLength).toBe(32); expect(first.lookupDigest).not.toEqual(first.digest);
    expect(await codec.lookup(first.token)).toEqual([{ keyId: first.keyId, lookupDigest: first.lookupDigest }]);
    expect(first.keyId).toBe("invitation_token-current");
    expect(await codec.verify(first.token, { ...context, keyId: first.keyId, digest: first.digest, lookupDigest: first.lookupDigest })).toBe(true);
    expect(codec).not.toHaveProperty("open"); expect(codec).not.toHaveProperty("decrypt");
    expect({ keyId: first.keyId, digest: first.digest, lookupDigest: first.lookupDigest }).not.toHaveProperty("token");
  });
  it("should close malformed, changed, crossed or removed-key tokens without accepting contact authority", async () => {
    const codec = createPersonalInvitationTokenCodec(config), context = { tribeId: "synthetic-tribe", invitationId: "synthetic-invitation" }, issued = await codec.issue(context);
    for (const token of ["", issued.token + "=", "x".repeat(43), issued.token.slice(0, 42), issued.token.replace(/.$/u, issued.token.endsWith("A") ? "B" : "A")]) expect(await codec.verify(token, { ...context, keyId: issued.keyId, digest: issued.digest, lookupDigest: issued.lookupDigest })).toBe(false);
    expect(await codec.verify(issued.token, { ...context, tribeId: "other-tribe", keyId: issued.keyId, digest: issued.digest, lookupDigest: issued.lookupDigest })).toBe(false);
    expect(await codec.verify(issued.token, { ...context, invitationId: "other-invitation", keyId: issued.keyId, digest: issued.digest, lookupDigest: issued.lookupDigest })).toBe(false);
    expect(await codec.verify(issued.token, { ...context, keyId: "retired-key", digest: issued.digest, lookupDigest: issued.lookupDigest })).toBe(false);
    const wrongPurpose = { ...config, keyrings: { ...config.keyrings, invitation_token: config.keyrings[MESSAGING_KEY_PURPOSE.contactFingerprint] } };
    expect(await createPersonalInvitationTokenCodec(wrongPurpose).verify(issued.token, { ...context, keyId: issued.keyId, digest: issued.digest, lookupDigest: issued.lookupDigest })).toBe(false);
  });
  it("should verify the retained original key after active-key rotation and close issuance during recovery", async () => {
    const context = { tribeId: "synthetic-tribe", invitationId: "synthetic-invitation" }, issued = await createPersonalInvitationTokenCodec(config).issue(context), original = config.keyrings[MESSAGING_KEY_PURPOSE.invitationToken];
    const nextKey = await crypto.subtle.importKey("raw", randomBytes(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    const rotated = { ...config, keyrings: { ...config.keyrings, invitation_token: { ...original, activeKeyId: "next-key", keys: new Map([...original.keys, ["next-key", nextKey]]) } } };
    expect(await createPersonalInvitationTokenCodec(rotated).verify(issued.token, { ...context, keyId: issued.keyId, digest: issued.digest, lookupDigest: issued.lookupDigest })).toBe(true);
    expect((await createPersonalInvitationTokenCodec(rotated).lookup(issued.token)).find((reference) => reference.keyId === issued.keyId)).toEqual({ keyId: issued.keyId, lookupDigest: issued.lookupDigest });
    await expect(createPersonalInvitationTokenCodec({ ...config, recoveryLocked: true }).issue(context)).rejects.toMatchObject({ code: "resource_unavailable" });
    expect(await createPersonalInvitationTokenCodec({ ...config, recoveryLocked: true }).verify(issued.token, { ...context, keyId: issued.keyId, digest: issued.digest, lookupDigest: issued.lookupDigest })).toBe(false);
  });
});
