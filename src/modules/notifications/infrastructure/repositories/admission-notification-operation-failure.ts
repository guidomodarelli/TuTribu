/** Closes failures of the protected admission notification writes to admission operation failures. @module admission-notification-operation-failure */
import "server-only";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";

/**
 * @param error - Failure of one protected notification write.
 * @returns The same admission failure, an incomplete connection for unusable private keys, otherwise an unresolved operation; the original stays as cause.
 */
export function toAdmissionNotificationOperationError(error: unknown): AdmissionOperationError {
  if (error instanceof AdmissionOperationError) return error;
  if (error instanceof MessagingCryptographyError) return new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete, { cause: error });
  return new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { cause: error });
}
