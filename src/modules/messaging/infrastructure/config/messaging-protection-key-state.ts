/** Projects only current hosting-key routing metadata for private rotation postvalidation. @module messaging-protection-key-state */
import type { MessagingProtectionKeyState } from "../../domain/repositories/messaging-protection-key-rotation";
import type { MessagingSecurityConfig } from "./messaging-security-config";
import { MESSAGING_KEY_PURPOSE } from "../../constants/messaging-cryptography";
import type { MessagingKeyPurpose } from "../../domain/value-objects/messaging-key-purpose";

/** @param select - Selects routing metadata only for each independent purpose. @returns A complete topology without a string-index cast or crypto material. */
export function createMessagingProtectionKeyTopology(select: (purpose: MessagingKeyPurpose) => { activeKeyId: string; keyIds: readonly string[] }): MessagingProtectionKeyState["keyrings"] {
  return { credential: select(MESSAGING_KEY_PURPOSE.credential), otp_envelope: select(MESSAGING_KEY_PURPOSE.otpEnvelope),
    verification_mac: select(MESSAGING_KEY_PURPOSE.verificationMac), invitation_token: select(MESSAGING_KEY_PURPOSE.invitationToken),
    contact_fingerprint: select(MESSAGING_KEY_PURPOSE.contactFingerprint), operation_payload: select(MESSAGING_KEY_PURPOSE.operationPayload) };
}

/** @param config - Already authorized private external config. @returns Metadata only; CryptoKey objects and material are never copied. */
export function projectMessagingProtectionKeyState(config: MessagingSecurityConfig): MessagingProtectionKeyState {
  return { environment: config.environment, securityEpoch: config.securityEpoch, recoveryLocked: config.recoveryLocked,
    keyrings: createMessagingProtectionKeyTopology((purpose) => ({ activeKeyId: config.keyrings[purpose].activeKeyId, keyIds: [...config.keyrings[purpose].keys.keys()].sort() })),
  };
}

/** @param previous - Original own metadata, without crypto values. @param current - Latest external metadata. @returns Whether the complete deployment/key topology remains the original one. */
export function messagingProtectionKeyStateMatches(previous: MessagingProtectionKeyState, current: MessagingProtectionKeyState): boolean {
  return !previous.recoveryLocked && !current.recoveryLocked && Boolean(previous.environment) && Boolean(previous.securityEpoch)
    && previous.environment === current.environment && previous.securityEpoch === current.securityEpoch
    && Object.values(MESSAGING_KEY_PURPOSE).every((purpose) => Boolean(previous.keyrings[purpose].activeKeyId) && Boolean(current.keyrings[purpose].activeKeyId)
      && previous.keyrings[purpose].keyIds.includes(previous.keyrings[purpose].activeKeyId)
      && current.keyrings[purpose].keyIds.includes(current.keyrings[purpose].activeKeyId)
      && new Set(previous.keyrings[purpose].keyIds).size === previous.keyrings[purpose].keyIds.length
      && new Set(current.keyrings[purpose].keyIds).size === current.keyrings[purpose].keyIds.length
      && previous.keyrings[purpose].activeKeyId === current.keyrings[purpose].activeKeyId
      && JSON.stringify([...previous.keyrings[purpose].keyIds].sort()) === JSON.stringify([...current.keyrings[purpose].keyIds].sort()));
}
