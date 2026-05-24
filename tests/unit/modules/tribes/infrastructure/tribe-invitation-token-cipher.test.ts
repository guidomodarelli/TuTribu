import { randomBytes } from "crypto";

import {
  decryptInvitationToken,
  encryptInvitationToken,
} from "@/src/modules/tribes/infrastructure/encryption/tribe-invitation-token-cipher";

const TRIBE_INVITATION_TOKEN_KEY_ENV = "TRIBE_INVITATION_TOKEN_ENCRYPTION_KEY";

function generateTestEncryptionKey(): string {
  return randomBytes(32).toString("base64");
}

describe("tribe invitation token cipher", () => {
  const previousKey = process.env[TRIBE_INVITATION_TOKEN_KEY_ENV];

  beforeEach(() => {
    process.env[TRIBE_INVITATION_TOKEN_KEY_ENV] = generateTestEncryptionKey();
  });

  afterEach(() => {
    if (previousKey === undefined) {
      delete process.env[TRIBE_INVITATION_TOKEN_KEY_ENV];
    } else {
      process.env[TRIBE_INVITATION_TOKEN_KEY_ENV] = previousKey;
    }
  });

  it("roundtrips an invitation token through encrypt and decrypt", () => {
    const token = "plain-invitation-token-abc";

    const encrypted = encryptInvitationToken(token);

    expect(encrypted).not.toContain(token);
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(decryptInvitationToken(encrypted)).toBe(token);
  });

  it("produces different ciphertexts for the same plain token", () => {
    const token = "another-plain-token";

    const firstCiphertext = encryptInvitationToken(token);
    const secondCiphertext = encryptInvitationToken(token);

    expect(firstCiphertext).not.toBe(secondCiphertext);
  });

  it("throws when the encryption key is missing", () => {
    delete process.env[TRIBE_INVITATION_TOKEN_KEY_ENV];

    expect(() => encryptInvitationToken("token")).toThrow(
      TRIBE_INVITATION_TOKEN_KEY_ENV
    );
  });

  it("throws when the encryption key length is invalid", () => {
    process.env[TRIBE_INVITATION_TOKEN_KEY_ENV] = Buffer.from("short").toString(
      "base64"
    );

    expect(() => encryptInvitationToken("token")).toThrow(
      TRIBE_INVITATION_TOKEN_KEY_ENV
    );
  });

  it("throws when the payload uses an unknown version", () => {
    expect(() => decryptInvitationToken("v2.aaa.bbb.ccc")).toThrow();
  });

  it("throws when the payload has been tampered with", () => {
    const encrypted = encryptInvitationToken("untampered-token");
    const [version, iv, authTag, ciphertext] = encrypted.split(".");
    const tamperedCiphertext = ciphertext.startsWith("A")
      ? "B" + ciphertext.slice(1)
      : "A" + ciphertext.slice(1);
    const tampered = [version, iv, authTag, tamperedCiphertext].join(".");

    expect(() => decryptInvitationToken(tampered)).toThrow();
  });

  it("throws when the payload structure is malformed", () => {
    expect(() => decryptInvitationToken("not-an-envelope")).toThrow();
  });
});
