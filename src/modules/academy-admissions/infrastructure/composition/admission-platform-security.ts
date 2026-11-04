/** Composes the read every screen uses to know, before a write, whether the admission ledger can sign. @module admission-platform-security */
import "server-only";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { readMessagingPlatformSecurityRequirement } from "@/src/modules/messaging/infrastructure/repositories/messaging-platform-security-probe";
import { ADMISSION_OPERATION_MAC_KEY_PURPOSES } from "../../constants/admission-operation";

/** Runs inside an authorized read transaction; null when every admission ledger write (and every write that reuses it) can be protected. */
export type AdmissionPlatformSecurityReader = (database: RequestDatabase) => Promise<PlatformSecurityRequirement | null>;

/**
 * @param readSecurityConfig - Live hosting security snapshot, the same one the ledger signs with.
 * @returns The read of the platform requirement, with the import and enrolled-proof checks the ledger claim runs.
 */
export function createAdmissionPlatformSecurityReader(readSecurityConfig: () => Promise<MessagingSecurityConfig>): AdmissionPlatformSecurityReader {
  return (database) => readMessagingPlatformSecurityRequirement(database, readSecurityConfig, ADMISSION_OPERATION_MAC_KEY_PURPOSES);
}
