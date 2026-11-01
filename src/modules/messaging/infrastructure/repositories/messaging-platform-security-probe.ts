/** Reads whether the ledger can sign right now, with the same checks a write runs, without changing anything. @module messaging-platform-security-probe */
import "server-only";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import type { MessagingSecurityConfig } from "../config/messaging-security-config";
import type { MessagingMacKeyPurpose } from "../../domain/value-objects/messaging-key-purpose";
import { classifyMessagingPlatformSecurityFailure } from "../config/messaging-platform-security-failure";
import { assertMessagingAuthenticatedMacKeyMaterials } from "./assert-messaging-key-material";

/**
 * Imports the hosting security and attests the enrolled proofs of the given HMAC purposes, as every ledger claim does.
 * @param database - Native account-authorized read transaction; attestation requires a current identity.
 * @param readSecurityConfig - Live hosting-secret snapshot; never browser input.
 * @param purposes - HMAC purposes the protected writes of the caller sign with.
 * @returns Null when the writes can be protected, otherwise the platform requirement that blocks them.
 * @throws The original failure when it is not a platform requirement (for example a native identity that is not current).
 */
export async function readMessagingPlatformSecurityRequirement(database: RequestDatabase, readSecurityConfig: () => Promise<MessagingSecurityConfig>, purposes: readonly MessagingMacKeyPurpose[]): Promise<PlatformSecurityRequirement | null> {
  try {
    await assertMessagingAuthenticatedMacKeyMaterials(database, await readSecurityConfig(), purposes);
    return null;
  } catch (error) {
    const requirement = classifyMessagingPlatformSecurityFailure(error);
    if (requirement) return requirement;
    throw error;
  }
}
