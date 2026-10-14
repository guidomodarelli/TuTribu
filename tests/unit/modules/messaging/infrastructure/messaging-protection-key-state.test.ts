/** Exercises key-routing metadata independently from importing or exposing hosting material. @module messaging-protection-key-state-tests */
import { describe, expect, it } from "vitest";
import { readMessagingHostingProtectionKeyState } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { messagingProtectionKeyStateMatches } from "@/src/modules/messaging/infrastructure/config/messaging-protection-key-state";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

/** @returns Own synthetic hosting input; intentionally non-decodable values prove metadata reads never import a key. */
function hostingState() {
  const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => [purpose, { activeKeyId: `${purpose}-active`, keys: [{ id: `${purpose}-old`, materialBase64: "synthetic-routing-only" }, { id: `${purpose}-active`, materialBase64: "synthetic-routing-only" }] }]));
  return { MESSAGING_SECURITY_ENVIRONMENT: "synthetic-rotation", MESSAGING_SECURITY_EPOCH: "synthetic-epoch", MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: JSON.stringify(keyrings) };
}

describe("private protection-key routing state", () => {
  it("should return only deployment, recovery and sorted routing ids without importing configured key values", () => {
    const state = readMessagingHostingProtectionKeyState(hostingState());
    expect(state.environment).toBe("synthetic-rotation");
    expect(state.recoveryLocked).toBe(false);
    expect(Object.keys(state).sort()).toEqual(["environment", "keyrings", "recoveryLocked", "securityEpoch"]);
    for (const purpose of Object.values(MESSAGING_KEY_PURPOSE)) expect(state.keyrings[purpose]).toEqual({ activeKeyId: `${purpose}-active`, keyIds: [`${purpose}-active`, `${purpose}-old`] });
    expect(JSON.stringify(state)).not.toContain("materialBase64");
    expect(JSON.stringify(state)).not.toContain("synthetic-routing-only");
  });

  it("should stop before reading keyring input when current recovery or deployment identity is unavailable", () => {
    let keyringReads = 0;
    const input = { ...hostingState(), MESSAGING_RECOVERY_LOCK: "true", get MESSAGING_KEYRINGS_JSON(): string { keyringReads += 1; throw new Error("Synthetic unavailable keyring input"); } };
    expect(() => readMessagingHostingProtectionKeyState(input)).toThrow(expect.objectContaining({ code: "messaging_crypto_recovery_locked" }));
    expect(keyringReads).toBe(0);
    expect(() => readMessagingHostingProtectionKeyState({ ...hostingState(), MESSAGING_SECURITY_EPOCH: "" })).toThrow(expect.objectContaining({ code: "messaging_crypto_recovery_locked" }));
  });

  it("should reject missing active routing ids and duplicates before loading crypto", () => {
    for (const duplicate of [false, true]) {
      const input = hostingState(), keyrings = JSON.parse(input.MESSAGING_KEYRINGS_JSON);
      if (duplicate) keyrings.credential.keys.push(keyrings.credential.keys[0]);
      else keyrings.credential.activeKeyId = "synthetic-absent";
      expect(() => readMessagingHostingProtectionKeyState({ ...input, MESSAGING_KEYRINGS_JSON: JSON.stringify(keyrings) })).toThrow(expect.objectContaining({ code: "messaging_crypto_configuration_invalid" }));
    }
  });

  it("should detect topology, epoch and recovery changes while accepting key-order changes", () => {
    const original = readMessagingHostingProtectionKeyState(hostingState());
    expect(messagingProtectionKeyStateMatches(original, { ...original, keyrings: { ...original.keyrings, credential: { ...original.keyrings.credential, keyIds: [...original.keyrings.credential.keyIds].reverse() } } })).toBe(true);
    expect(messagingProtectionKeyStateMatches(original, { ...original, securityEpoch: "another-epoch" })).toBe(false);
    expect(messagingProtectionKeyStateMatches(original, { ...original, recoveryLocked: true })).toBe(false);
    expect(messagingProtectionKeyStateMatches(original, { ...original, keyrings: { ...original.keyrings, credential: { ...original.keyrings.credential, keyIds: [original.keyrings.credential.activeKeyId] } } })).toBe(false);
  });
});
