/** @vitest-environment node */
/** Exercises actual hosting-secret decoding and nonextractable key import without provider credentials. @module messaging-hosting-security-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readMessagingHostingSecurityConfig, readMessagingRecoveryLock } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

/** Creates external synthetic secret material only for the importer contract. */
function hostingEnvironment() {
  const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
  return { environment: { MESSAGING_SECURITY_ENVIRONMENT: "synthetic-hosting", MESSAGING_SECURITY_EPOCH: randomUUID(), MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: JSON.stringify(keyrings) }, keyrings };
}

describe("messaging hosting security", () => {
  it("should import six independent hosting keyrings without a mutable cache or extractable keys", async () => {
    const fixture = hostingEnvironment();
    const imported = await readMessagingHostingSecurityConfig(fixture.environment);
    expect(imported).toMatchObject({ environment: fixture.environment.MESSAGING_SECURITY_ENVIRONMENT, securityEpoch: fixture.environment.MESSAGING_SECURITY_EPOCH, recoveryLocked: false });
    for (const purpose of Object.values(MESSAGING_KEY_PURPOSE)) expect(imported.keyrings[purpose].keys.get(imported.keyrings[purpose].activeKeyId)?.extractable).toBe(false);
    const rotated = { ...fixture.environment, MESSAGING_SECURITY_EPOCH: randomUUID(), MESSAGING_RECOVERY_LOCK: "true" };
    expect(await readMessagingHostingSecurityConfig(rotated)).toMatchObject({ securityEpoch: rotated.MESSAGING_SECURITY_EPOCH, recoveryLocked: true });
    expect(imported.securityEpoch).toBe(fixture.environment.MESSAGING_SECURITY_EPOCH);
  });

  it("should fail closed for missing or ambiguous recovery configuration while allowing readonly lock checks without keys", () => {
    for (const value of [undefined, "", "FALSE", "disabled"]) expect(readMessagingRecoveryLock({ MESSAGING_RECOVERY_LOCK: value })).toBe(true);
    expect(readMessagingRecoveryLock({ MESSAGING_RECOVERY_LOCK: "false" })).toBe(false);
    expect(readMessagingRecoveryLock({ MESSAGING_RECOVERY_LOCK: "true" })).toBe(true);
  });

  it("should reject incomplete, malformed or reused material without putting a secret in the top-level diagnostic", async () => {
    const fixture = hostingEnvironment();
    await expect(readMessagingHostingSecurityConfig({ ...fixture.environment, MESSAGING_SECURITY_EPOCH: "" })).rejects.toMatchObject({ code: "messaging_crypto_configuration_invalid" });
    await expect(readMessagingHostingSecurityConfig({ ...fixture.environment, MESSAGING_KEYRINGS_JSON: "{}" })).rejects.toMatchObject({ code: "messaging_crypto_configuration_invalid" });
    const malformed = `${randomBytes(32).toString("base64")} invalid-json`;
    try { await readMessagingHostingSecurityConfig({ ...fixture.environment, MESSAGING_KEYRINGS_JSON: malformed }); throw new Error("Synthetic malformed secret was accepted"); }
    catch (error) { expect(error).toMatchObject({ code: "messaging_crypto_configuration_invalid" }); expect((error as Error).message).not.toContain(malformed); }
    const purposes = Object.values(MESSAGING_KEY_PURPOSE);
    fixture.keyrings[purposes[1]].keys[0].materialBase64 = fixture.keyrings[purposes[0]].keys[0].materialBase64;
    await expect(readMessagingHostingSecurityConfig({ ...fixture.environment, MESSAGING_KEYRINGS_JSON: JSON.stringify(fixture.keyrings) })).rejects.toMatchObject({ code: "messaging_crypto_key_reused" });
  });
});
