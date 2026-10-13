/** Issues one-view opaque personal invitation material and verifies stored HMAC references without recovery. @module personal-invitation-token */
import "server-only";
import { randomBytes } from "node:crypto";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { PERSONAL_INVITATION_TOKEN } from "../../constants/personal-invitation-token";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";

/** Only the original private resource scope participates in token verification, never role/contact permission. */
export type PersonalInvitationTokenContext = { tribeId: string; invitationId: string };
/** Persistence receives this digest/key reference; it cannot recover the initial plaintext or URL. */
export type PersonalInvitationTokenReference = PersonalInvitationTokenContext & { keyId: string; digest: Uint8Array; lookupDigest: Uint8Array };

/** @param token - Presented opaque material. @returns Whether alphabet, length and padding bits encode exactly the issued entropy. */
function isCanonicalToken(token: string): boolean {
  if (!PERSONAL_INVITATION_TOKEN.canonicalPattern.test(token)) return false;
  const decoded = Buffer.from(token, "base64url");
  return decoded.byteLength === PERSONAL_INVITATION_TOKEN.entropyBytes && decoded.toString("base64url") === token;
}

/** @param token - Canonical material. @param keyId - Retained private lookup key reference. @returns Domain-separated lookup bytes independent of unknown resource identity. */
function lookupBytes(token: string, keyId: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify([PERSONAL_INVITATION_TOKEN.lookupDomain, keyId, token]));
}

/** @param token - Canonical one-view material. @param context - Exact owning resource. @param keyId - Retained independent token key reference. @returns Domain-separated authenticated bytes without serializing provider credentials. */
function tokenBytes(token: string, context: PersonalInvitationTokenContext, keyId: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify([PERSONAL_INVITATION_TOKEN.fingerprintDomain, keyId, context.tribeId, context.invitationId, token]));
}

/** @param config - Current private hosting keyring/epoch and recovery state. @returns A server-only issuer/verifier with no decrypt/open method; the application still owns all eligibility and replay decisions. */
export function createPersonalInvitationTokenCodec(config: MessagingSecurityConfig) {
  const ring = config.keyrings[MESSAGING_KEY_PURPOSE.invitationToken];
  return {
    /** @param context - Server-selected tribe and invitation, never a browser permission. @returns Unpredictable initial token and its nonrecoverable digest/key reference. @throws AdmissionOperationError when security or scope is unavailable. */
    async issue(context: PersonalInvitationTokenContext) {
      const keyId = ring.activeKeyId, key = ring.keys.get(keyId);
      if (config.recoveryLocked || !key || ring.purpose !== MESSAGING_KEY_PURPOSE.invitationToken || !context.tribeId || !context.invitationId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      const token = randomBytes(PERSONAL_INVITATION_TOKEN.entropyBytes).toString("base64url");
      try { return { token, keyId, digest: new Uint8Array(await crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm, key, tokenBytes(token, context, keyId))), lookupDigest: new Uint8Array(await crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm, key, lookupBytes(token, keyId))) }; }
      catch (error) { throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable, { cause: error }); }
    },
    /** @param token - Untrusted URL material containing no resource identity. @returns One indexable digest per retained token key; lookup does not establish recipient authority or consume the resource. */
    async lookup(token: string): Promise<{ keyId: string; lookupDigest: Uint8Array }[]> {
      if (config.recoveryLocked || ring.purpose !== MESSAGING_KEY_PURPOSE.invitationToken || !isCanonicalToken(token)) return [];
      try { return await Promise.all([...ring.keys].map(async ([keyId, key]) => ({ keyId, lookupDigest: new Uint8Array(await crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm, key, lookupBytes(token, keyId))) }))); }
      catch (error) { throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable, { cause: error }); }
    },
    /** @param token - Untrusted presented opaque material. @param reference - Original stored digest and retained private scope. @returns True only for a canonical exact cryptographic match; this never grants or consumes an invitation. */
    async verify(token: string, reference: PersonalInvitationTokenReference): Promise<boolean> {
      const key = ring.keys.get(reference.keyId);
      if (config.recoveryLocked || ring.purpose !== MESSAGING_KEY_PURPOSE.invitationToken || !key || !reference.tribeId || !reference.invitationId || reference.digest.byteLength !== PERSONAL_INVITATION_TOKEN.digestBytes || reference.lookupDigest.byteLength !== PERSONAL_INVITATION_TOKEN.digestBytes || !isCanonicalToken(token)) return false;
      try { return await crypto.subtle.verify(MESSAGING_CRYPTO.macAlgorithm, key, Uint8Array.from(reference.lookupDigest), lookupBytes(token, reference.keyId)) && await crypto.subtle.verify(MESSAGING_CRYPTO.macAlgorithm, key, Uint8Array.from(reference.digest), tokenBytes(token, reference, reference.keyId)); }
      catch (error) { throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable, { cause: error }); }
    },
  };
}
