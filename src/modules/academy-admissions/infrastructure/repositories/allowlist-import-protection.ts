/** Tells a temporary platform lock apart from a hosting security rotation that invalidates a saved import. @module allowlist-import-protection */
import "server-only";
import type { MessagingKeyPurpose, MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { MESSAGING_CRYPTO_ERROR } from "@/src/modules/messaging/constants/messaging-cryptography";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/** Hosting security a saved import (or the block being confirmed) was protected with. */
export type AllowlistImportProtection = { environment: string | null; securityEpoch: string | null; key: { purpose: MessagingKeyPurpose; keyId: string } };

/**
 * @param current - Hosting security read now, inside the confirmation transaction.
 * @param protectedWith - Environment, epoch and key the import was protected with.
 * @throws MessagingCryptographyError while the platform locked the hosting security. It is not a known import denial, so the
 * transaction rolls back and the original stays unresolved instead of recording a business rejection; it resumes once the lock ends.
 * @throws AdmissionOperationError (resource_unavailable) once the hosting security rotated: this import can never be confirmed
 * again and the leader needs a new preview of the file.
 */
export function assertAllowlistImportProtection(current: MessagingSecurityConfig, protectedWith: AllowlistImportProtection): void {
  if (current.recoveryLocked) throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.recoveryLocked);
  const rotated = current.environment !== protectedWith.environment || current.securityEpoch !== protectedWith.securityEpoch || !current.keyrings[protectedWith.key.purpose].keys.has(protectedWith.key.keyId);
  if (rotated) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
}
