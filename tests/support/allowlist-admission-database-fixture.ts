/** Seeds native common-list accounts and trusted base captures exclusively on an owned test branch. @module allowlist-admission-database-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAllowlistManagement } from "./allowlist-management-database-fixture";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";

/** @param database - Already verified owned disposable branch. @param securityConfig - Optional local host security shared only in memory with its own Next process. @returns Current protected list academy, native applicants/leader and real command composition without provider RPC. */
export async function prepareAllowlistAdmission(database: AcademyAdmissionTestDatabase, securityConfig?: MessagingSecurityConfig) {
  const fixture = await prepareAllowlistManagement(database, securityConfig);
  for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007005000_read_admission_reviews.sql", "20261007030000_capture_admission_decision_evidence.sql", "20261009082000_capture_automatic_allowlist_authorization.sql", "20261009083000_read_current_admission_review_evidence.sql"]) await database.applyMigration(migration);
  await database.withContext(fixture.own, async (transaction) => { const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now; await transaction.execute(sql`update public.academy_admission_policies set mode='allowlist',is_open=true,allow_common_exceptions=true,activated_at=${now},version=version+1 where tribe_id=${fixture.tribeId}`); await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${fixture.tribeId}`); });
  /** @param userId - Exact synthetic account. @param sessionId - Its real persisted session. @returns Native current commands bound to actual actor context on every transaction. */
  const commands = (userId: string, sessionId: string) => {
    const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId, sessionId }), (_identity, run) => database.withContext({ userId, email: null }, run));
    return buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.config }).useCases;
  };
  /** @param trusted - Whether the owned capture provides base authority. @returns A synthetic native account with no body-supplied evidence flags or real provider credential. */
  const applicant = async (trusted = true) => {
    const userId = randomUUID(), sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), evidenceId = randomUUID(), email = `synthetic.${randomUUID()}+tag@example.test`;
    await database.withContext(fixture.own, async (transaction) => {
      const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
      await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic list applicant',${email},false,${now},${now})`);
      await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${randomUUID()},clock_timestamp()+interval '1 hour',${now},${now})`);
      await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${userId},'google',${subject},${now},${now})`);
      await transaction.execute(sql`insert into public.global_identity_evidence(id,user_id,account_id,provider_id,provider_subject,normalized_email,email_verified_claim,hosted_domain,classification,issuer,audience,token_issued_at,token_expires_at,verified_at) values (${evidenceId},${userId},${accountId},'google',${subject},${email},${trusted},${trusted ? "example.test" : null},${trusted ? "workspace" : "insufficient"},'https://accounts.google.com','synthetic-list-client',${now},clock_timestamp()+interval '1 hour',${now})`);
    });
    return { userId, sessionId, accountId, subject, email, evidenceId, commands: commands(userId, sessionId), input: { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 2, confirmed: true as const } };
  };
  return { fixture, applicant, leader: commands(fixture.userId, fixture.sessionId) };
}
