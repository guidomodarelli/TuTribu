/** Checks immutable contact protection before creating or recognizing a private account binding. @module assert-admission-contact-key-material */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { assertMessagingAuthenticatedMacKeyMaterial, assertMessagingPrivateMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { classifyMessagingPlatformSecurityFailure } from "@/src/modules/messaging/infrastructure/config/messaging-platform-security-failure";

/**
 * @param database - Account/resource-authorized original transaction or explicit private backend. @param security - Current local protection config.
 * @returns After the native principal and original key material match.
 * @throws AdmissionOperationError without exposing crypto diagnostics: platform_security_unavailable when the platform cannot protect the
 * contact (unenrolled, rotated or locked keys), never recorded as a business denial; resource_unavailable for another closed failure.
 */
export async function assertAdmissionContactKeyMaterial(database: RequestDatabase, security: MessagingSecurityConfig): Promise<void> {
  const actor = (await database.execute<{ actor: string | null }>(sql`select public.current_app_user_id() as actor`)).rows[0].actor;
  try {
    if (actor === null) await assertMessagingPrivateMacKeyMaterial(database, security, MESSAGING_KEY_PURPOSE.contactFingerprint);
    else await assertMessagingAuthenticatedMacKeyMaterial(database, security, MESSAGING_KEY_PURPOSE.contactFingerprint);
  } catch (error) {
    if (classifyMessagingPlatformSecurityFailure(error)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.platformSecurityUnavailable, { cause: error });
    if (error instanceof MessagingCryptographyError) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable, { cause: error });
    throw error;
  }
}
