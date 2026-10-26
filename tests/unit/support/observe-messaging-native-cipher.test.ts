/** @vitest-environment node */
/** Uses the real platform to calibrate cipher observation and isolate concurrent noncipher work. */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { observeMessagingNativeCipher } from "@/tests/support/observe-messaging-native-cipher";
import { MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";

/** @returns Real nonextractable AES material; raw input is erased immediately after native import. */
async function cipherKey() {
  const material = randomBytes(MESSAGING_CRYPTO.keyBytes);
  try { return await crypto.subtle.importKey("raw", material, MESSAGING_CRYPTO.aesAlgorithm, false, ["encrypt", "decrypt"]); }
  finally { material.fill(0); }
}

describe("native cipher observation", () => {
  it("observes real encryption and decryption while preserving the actual plaintext result", async () => {
    const key = await cipherKey(), iv = randomBytes(MESSAGING_CRYPTO.ivBytes);
    const plaintext = new TextEncoder().encode("synthetic cipher observation");
    const encrypted = await observeMessagingNativeCipher(() => crypto.subtle.encrypt({ name: MESSAGING_CRYPTO.aesAlgorithm, iv }, key, plaintext));
    const decrypted = await observeMessagingNativeCipher(() => crypto.subtle.decrypt({ name: MESSAGING_CRYPTO.aesAlgorithm, iv }, key, encrypted.value));
    expect(encrypted.cipherOperations).toBe(1);
    expect(decrypted.cipherOperations).toBe(1);
    expect(new Uint8Array(decrypted.value)).toEqual(plaintext);
  });

  it("keeps concurrent work outside the observation separate from a real HMAC operation", async () => {
    const key = await cipherKey(), iv = randomBytes(MESSAGING_CRYPTO.ivBytes), input = new TextEncoder().encode("synthetic concurrent work");
    const material = randomBytes(MESSAGING_CRYPTO.keyBytes);
    const macKey = await crypto.subtle.importKey("raw", material, { name: MESSAGING_CRYPTO.macAlgorithm, hash: MESSAGING_CRYPTO.macHash }, false, ["sign", "verify"]);
    material.fill(0);
    const [observed] = await Promise.all([
      observeMessagingNativeCipher(() => crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm, macKey, input)),
      crypto.subtle.encrypt({ name: MESSAGING_CRYPTO.aesAlgorithm, iv }, key, input),
    ]);
    expect(observed.cipherOperations).toBe(0);
    expect(await crypto.subtle.verify(MESSAGING_CRYPTO.macAlgorithm, macKey, observed.value, input)).toBe(true);
  });

  it("preserves the actual native authentication failure rather than returning an empty success", async () => {
    const key = await cipherKey(), iv = randomBytes(MESSAGING_CRYPTO.ivBytes), otherIv = randomBytes(MESSAGING_CRYPTO.ivBytes);
    const ciphertext = await crypto.subtle.encrypt({ name: MESSAGING_CRYPTO.aesAlgorithm, iv }, key, new TextEncoder().encode("synthetic authenticated bytes"));
    let nativeError: unknown;
    try { await crypto.subtle.decrypt({ name: MESSAGING_CRYPTO.aesAlgorithm, iv: otherIv }, key, ciphertext); }
    catch (error) { nativeError = error; }
    expect(nativeError).toBeInstanceOf(DOMException);
    await expect(observeMessagingNativeCipher(async () => { throw nativeError; })).rejects.toBe(nativeError);
    await expect(observeMessagingNativeCipher(() => crypto.subtle.decrypt({ name: MESSAGING_CRYPTO.aesAlgorithm, iv: otherIv }, key, ciphertext))).rejects.toMatchObject({ name: "OperationError" });
  });
});
