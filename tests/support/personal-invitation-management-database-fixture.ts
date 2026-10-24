/** Prepares the real administrative page schema, including its signed-in layout inbox. @module personal-invitation-management-database-fixture */
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAllowlistManagement } from "./allowlist-management-database-fixture";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";

/** @param database - Exact owned disposable branch. @param securityConfig - Optional synthetic hosting keys shared only in memory. @returns Native leader fixture after existing page and inbox migrations run. */
export async function preparePersonalInvitationManagementDatabase(database: AcademyAdmissionTestDatabase, securityConfig?: MessagingSecurityConfig) {
  const fixture = await prepareAllowlistManagement(database, securityConfig);
  for (const migration of [
    "20261005093000_guard_academy_membership_sources.sql",
    "20261007231500_bind_verification_operation_purpose.sql",
    "20261007001000_read_public_admission_overview.sql",
    "20261007002000_read_own_admission_operations.sql",
    "20261008220000_scope_admission_operation_recovery.sql",
    "20261009130000_add_personal_invitation_context_digest.sql",
    "20261006220000_extend_admission_notifications.sql",
    "20261007003000_read_admission_notification_subject.sql",
  ]) await database.applyMigration(migration);
  return fixture;
}
