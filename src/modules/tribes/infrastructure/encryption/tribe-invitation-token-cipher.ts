import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const TRIBE_INVITATION_TOKEN_CIPHER = {
  algorithm: "aes-256-gcm",
  authTagLengthBytes: 16,
  envelopeSeparator: ".",
  expectedKeyLengthBytes: 32,
  ivLengthBytes: 12,
  keyEncoding: "base64",
  payloadEncoding: "base64url",
  plaintextEncoding: "utf8",
  version: "v1",
} as const;

const TRIBE_INVITATION_TOKEN_KEY_ENV = "TRIBE_INVITATION_TOKEN_ENCRYPTION_KEY";

const TRIBE_INVITATION_TOKEN_CIPHER_ERROR = {
  invalidKeyLength:
    TRIBE_INVITATION_TOKEN_KEY_ENV +
    " must decode to 32 bytes for AES-256-GCM",
  invalidPayload: "Invalid tribe invitation token envelope",
  missingKey:
    TRIBE_INVITATION_TOKEN_KEY_ENV +
    " is required to encrypt tribe invitation tokens",
  unsupportedVersion:
    "Unsupported tribe invitation token envelope version",
} as const;

function readEncryptionKey(): Buffer {
  const rawKey = process.env[TRIBE_INVITATION_TOKEN_KEY_ENV];

  if (!rawKey) {
    throw new Error(TRIBE_INVITATION_TOKEN_CIPHER_ERROR.missingKey);
  }

  const key = Buffer.from(rawKey, TRIBE_INVITATION_TOKEN_CIPHER.keyEncoding);

  if (key.length !== TRIBE_INVITATION_TOKEN_CIPHER.expectedKeyLengthBytes) {
    throw new Error(TRIBE_INVITATION_TOKEN_CIPHER_ERROR.invalidKeyLength);
  }

  return key;
}

export function encryptInvitationToken(token: string): string {
  const key = readEncryptionKey();
  const initializationVector = randomBytes(
    TRIBE_INVITATION_TOKEN_CIPHER.ivLengthBytes
  );
  const cipher = createCipheriv(
    TRIBE_INVITATION_TOKEN_CIPHER.algorithm,
    key,
    initializationVector,
    { authTagLength: TRIBE_INVITATION_TOKEN_CIPHER.authTagLengthBytes }
  );
  const ciphertext = Buffer.concat([
    cipher.update(token, TRIBE_INVITATION_TOKEN_CIPHER.plaintextEncoding),
    cipher.final(),
  ]);
  const authenticationTag = cipher.getAuthTag();

  return [
    TRIBE_INVITATION_TOKEN_CIPHER.version,
    initializationVector.toString(TRIBE_INVITATION_TOKEN_CIPHER.payloadEncoding),
    authenticationTag.toString(TRIBE_INVITATION_TOKEN_CIPHER.payloadEncoding),
    ciphertext.toString(TRIBE_INVITATION_TOKEN_CIPHER.payloadEncoding),
  ].join(TRIBE_INVITATION_TOKEN_CIPHER.envelopeSeparator);
}

export function decryptInvitationToken(payload: string): string {
  const parts = payload.split(TRIBE_INVITATION_TOKEN_CIPHER.envelopeSeparator);

  if (parts.length !== 4) {
    throw new Error(TRIBE_INVITATION_TOKEN_CIPHER_ERROR.invalidPayload);
  }

  const [version, encodedIv, encodedAuthTag, encodedCiphertext] = parts;

  if (version !== TRIBE_INVITATION_TOKEN_CIPHER.version) {
    throw new Error(TRIBE_INVITATION_TOKEN_CIPHER_ERROR.unsupportedVersion);
  }

  const key = readEncryptionKey();
  const initializationVector = Buffer.from(
    encodedIv,
    TRIBE_INVITATION_TOKEN_CIPHER.payloadEncoding
  );
  const authenticationTag = Buffer.from(
    encodedAuthTag,
    TRIBE_INVITATION_TOKEN_CIPHER.payloadEncoding
  );
  const ciphertext = Buffer.from(
    encodedCiphertext,
    TRIBE_INVITATION_TOKEN_CIPHER.payloadEncoding
  );

  if (
    initializationVector.length !== TRIBE_INVITATION_TOKEN_CIPHER.ivLengthBytes ||
    authenticationTag.length !==
      TRIBE_INVITATION_TOKEN_CIPHER.authTagLengthBytes
  ) {
    throw new Error(TRIBE_INVITATION_TOKEN_CIPHER_ERROR.invalidPayload);
  }

  const decipher = createDecipheriv(
    TRIBE_INVITATION_TOKEN_CIPHER.algorithm,
    key,
    initializationVector,
    { authTagLength: TRIBE_INVITATION_TOKEN_CIPHER.authTagLengthBytes }
  );
  decipher.setAuthTag(authenticationTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString(TRIBE_INVITATION_TOKEN_CIPHER.plaintextEncoding);
}
