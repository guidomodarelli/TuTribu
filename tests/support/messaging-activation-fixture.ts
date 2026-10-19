/** Owns initial schema preparation before delegating to the native activation runtime. */
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareMessagingConnectionCreation } from "./messaging-connection-fixture";
import { prepareMessagingActivationFromCreation } from "./messaging-activation-native";
import { MESSAGING_NATIVE_ACTIVATION } from "./constants/messaging-activation-native";
import type { MessagingRestoreSql } from "./messaging-restore-composition";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";

/** @param database - Exact owned full fixture. @returns Migration capability only when originally granted. */
function initialActivationDatabase(database: AcademyAdmissionTestDatabase | MessagingRestoreSql): AcademyAdmissionTestDatabase {
  if ("applyMigration" in database) return database;
  throw new Error("MessagingActivationFixture.prepare failed: owned_migration_capability_required");
}

/** @param database - Owned parent or SQL-only restore child. @param existing - Optional original owner for a separate replacement. @param diagnosticRecipient - Optional distinct synthetic challenge namespace. @param securityConfig - Optional original external host configuration. @returns Actual configuration, SDK validation and diagnostic authority through closed HTTP. */
export async function prepareMessagingConnectionActivation(database: AcademyAdmissionTestDatabase | MessagingRestoreSql, existing?: Awaited<ReturnType<typeof prepareMessagingConnectionCreation>>, diagnosticRecipient?: string, securityConfig?: MessagingSecurityConfig) {
  const fixture = existing ?? await prepareMessagingConnectionCreation(initialActivationDatabase(database), securityConfig);
  if (!existing) for (const migration of MESSAGING_NATIVE_ACTIVATION.migrations) await initialActivationDatabase(database).applyMigration(migration);
  return prepareMessagingActivationFromCreation(database, fixture, { diagnosticRecipient, initializeUsagePolicy: !existing });
}
