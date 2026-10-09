/** Protects a canonical contact using the existing independent contact keyring without budget or binding effects. @module admission-contact-fingerprint */
import "server-only";
import type { AdmissionContact } from "../../domain/value-objects/admission-contact";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { CONTACT_BUDGET_FINGERPRINT_DOMAIN } from "@/src/modules/messaging/constants/contact-budget";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/** @param contact - Exact canonical own contact, never a browser permission. @param config - Current private independent keyring/recovery snapshot. @returns A protected digest and retained key id without reserving the contact. @throws AdmissionOperationError when the local security material is unavailable. */
export async function createAdmissionContactFingerprint(contact: AdmissionContact, config: MessagingSecurityConfig) {
  const ring = config.keyrings[MESSAGING_KEY_PURPOSE.contactFingerprint], keyId = ring.activeKeyId, key = ring.keys.get(keyId);
  if (config.recoveryLocked || !key) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
  const bytes = new TextEncoder().encode(JSON.stringify([CONTACT_BUDGET_FINGERPRINT_DOMAIN, keyId, contact.type, contact.value]));
  return { keyId, digest: new Uint8Array(await crypto.subtle.sign(MESSAGING_CRYPTO.macAlgorithm, key, bytes)) };
}
