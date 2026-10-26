/** Registers the synthetic MAC key material a native server signs admission operations with. @module admission-operation-mac-keys */
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { ADMISSION_OPERATION_MAC_KEY_PURPOSES } from "@/src/modules/academy-admissions/constants/admission-operation";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { registerMessagingPrivateMacKeyMaterial } from "@/src/modules/messaging/infrastructure/repositories/assert-messaging-key-material";

/**
 * Registers every admission-operation MAC purpose of the server keyrings; the original-operation ledger refuses to sign with unregistered material.
 * @param database - Verified owned branch with the current migration journal.
 * @param securityConfig - Hosting configuration the native server reads from the same synthetic keyrings.
 * @returns Nothing after the branch holds a verifier for each purpose.
 */
export async function registerAdmissionOperationMacKeys(database: Pick<AcademyAdmissionTestDatabase, "withContext">, securityConfig: MessagingSecurityConfig): Promise<void> {
  await database.withContext({ userId: null, email: null }, async (transaction) => {
    for (const purpose of ADMISSION_OPERATION_MAC_KEY_PURPOSES) await registerMessagingPrivateMacKeyMaterial(transaction, securityConfig, purpose);
  });
}
