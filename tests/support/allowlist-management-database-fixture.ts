/** Seeds a native leader and action-bound recency exclusively on an owned disposable SQL branch. @module allowlist-management-database-fixture */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareContactVerificationDatabase } from "./contact-verification-database-fixture";
import { RECENT_AUTHENTICATION_WINDOW_MS } from "@/src/modules/auth/constants/recent-authentication";
import type { ReauthenticationOperation } from "@/src/modules/auth/constants/reauthentication-resources";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import { PostgresAllowlistRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-repository";

/** @param database - Exact owned branch, never a production connection. @returns Native account/config, explicit signed confirmations and real writer with controlled response loss only. */
export async function prepareAllowlistManagement(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareContactVerificationDatabase(database);
  for (const migration of ["20261005095000_guard_global_identity_context.sql", "20261005101000_guard_admission_operation_identity.sql", "20261006200000_scope_admission_audit_operations.sql"]) await database.applyMigration(migration);
  const tribeId = randomUUID(), accountId = randomUUID(), sessionId = randomUUID(), subject = randomUUID();
  await database.withContext(fixture.own, async (transaction) => {
    const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic allowlist tribe',${`allowlist-${tribeId}`},${fixture.userId})`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.userId},'leader','active')`);
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id) values (${tribeId})`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},'google',${subject},${now},${now})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},${new Date(now.getTime()+RECENT_AUTHENTICATION_WINDOW_MS)},${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
  });
  /** @param operation - Exact server-selected sensitive purpose. @param resourceId - Tribe for create or own existing entry for edit. @returns A real persisted confirmation context without caller-supplied auth time. */
  const confirm = async (operation: ReauthenticationOperation, resourceId: string = tribeId): Promise<AuthorizedAdmissionContext> => {
    await database.withContext(fixture.own, async (transaction) => {
      const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now), until = new Date(now.getTime() + RECENT_AUTHENTICATION_WINDOW_MS), intentId = randomUUID();
      await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.userId},${sessionId},${accountId},${subject},${tribeId},${operation},${resourceId},'/synthetic-allowlist',${randomBytes(32)},'consumed',${now},${until},${now})`);
      await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.userId},${accountId},${subject},${sessionId},${tribeId},${operation},${resourceId},${now},${now},${until})`);
    });
    return { userId: fixture.userId, sessionId, tribeId, requestId: randomUUID(), role: "leader", membershipStatus: "active", resourceId, action: "manage_allowlist", sensitiveOperation: operation };
  };
  let loseReply = false;
  const writer = new PostgresAllowlistRepository(async (_context, run) => {
    const result = await database.withContext(fixture.own, run);
    if (loseReply && typeof result === "object" && result !== null && "state" in result && result.state === "completed") { loseReply = false; throw new Error("Controlled allowlist COMMIT response loss"); }
    return result;
  }, async () => fixture.config);
  return { ...fixture, tribeId, sessionId, confirm, writer, loseNextReply: () => { loseReply = true; } };
}
