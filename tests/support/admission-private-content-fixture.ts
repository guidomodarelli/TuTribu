/** Prepares coherent historical parents and current native actors for private-content boundaries. @module admission-private-content-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareContactVerificationDatabase } from "./contact-verification-database-fixture";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";

/** @param database - Exact disposable branch owned by this test. @returns Native accounts with initially historical parents and real current sessions/commands. */
export async function prepareAdmissionPrivateContent(database: AcademyAdmissionTestDatabase) {
  const security = await prepareContactVerificationDatabase(database);
  for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261005095000_guard_global_identity_context.sql", "20261005101000_guard_admission_operation_identity.sql", "20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261011024000_read_current_own_admission_eligibility.sql", "20261007005000_read_admission_reviews.sql", "20261007030000_capture_admission_decision_evidence.sql", "20261009082000_capture_automatic_allowlist_authorization.sql", "20261009083000_read_current_admission_review_evidence.sql"]) await database.applyMigration(migration);
  const tribeId = randomUUID();
  /** @param userId - Actual persisted owner. @param sessionId - Current native session. @returns Real command composition using SQL authority on every operation. */
  const commands = (userId: string, sessionId: string) => {
    const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId, sessionId }), (_identity, run) => database.withContext({ userId, email: null }, run));
    return buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => security.config }).useCases;
  };
  /** @param name - Safe synthetic public name, optionally a runtime directory canary. @returns An initially historical account and OAuth parent with a fresh current native session; no dates are later rewritten. */
  const createActor = async (name = "Participante de ejemplo") => {
    const userId = randomUUID(), sessionId = randomUUID(), sessionToken = randomUUID(), accountId = randomUUID(), subject = randomUUID(), email = `${userId}@example.test`;
    await database.withContext(security.own, async (transaction) => {
      await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},${name},${email},false,transaction_timestamp()-interval '40 days',transaction_timestamp()-interval '40 days')`);
      await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${userId},'google',${subject},transaction_timestamp()-interval '40 days',transaction_timestamp()-interval '40 days')`);
      await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${sessionToken},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
      await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${userId},${accountId},${subject},${email})`);
    });
    return { userId, sessionId, sessionToken, accountId, subject, email, commands: commands(userId, sessionId), input: { tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 3, confirmed: true as const } };
  };
  const privateDirectoryMarker = randomUUID();
  const leader = await createActor(privateDirectoryMarker), guardian = await createActor();
  const own = { userId: leader.userId, email: leader.email };
  await database.withContext(security.own, async (transaction) => {
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by,created_at) values (${tribeId},'Academia de privacidad',${`allowlist-${tribeId}`},${leader.userId},transaction_timestamp()-interval '39 days')`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled,created_at,updated_at) values (${tribeId},'academy',true,transaction_timestamp()-interval '37 days',transaction_timestamp()-interval '35 days')`);
    // Pre-cutover memberships are legitimate fixtures, never an insertion after protected activation.
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status,created_at) values (${tribeId},${leader.userId},'leader','active',transaction_timestamp()-interval '38 days'),(${tribeId},${guardian.userId},'guardian','active',transaction_timestamp()-interval '38 days')`);
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,mode,is_open,allow_common_exceptions,version,activated_at,created_at,updated_at,changed_by_user_id) values (${tribeId},'manual_review',true,true,3,transaction_timestamp()-interval '35 days',transaction_timestamp()-interval '37 days',transaction_timestamp()-interval '35 days',${leader.userId})`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=transaction_timestamp()-interval '35 days' where id=${tribeId}`);
  });
  return { fixture: { tribeId, userId: leader.userId, sessionId: leader.sessionId, sessionToken: leader.sessionToken, own, config: security.config }, privateDirectoryMarker, guardian, createApplicant: createActor, leader: leader.commands };
}
