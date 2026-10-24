/** Seeds a native leader and action-bound operation contexts exclusively on an owned disposable SQL branch. @module allowlist-management-database-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareContactVerificationDatabase, seedContactVerificationDatabase } from "./contact-verification-database-fixture";
import type { ReauthenticationOperation } from "@/src/modules/auth/constants/reauthentication-resources";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import { PostgresAllowlistRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-repository";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";

/** Keeps the synthetic leader session alive for the whole native scenario. */
const LEADER_SESSION_LIFETIME_MS = 10 * 60 * 1000;

/** @param database - Exact owned branch, never a production connection. @param securityConfig - Optional private native-host security shared only in memory with an owned Next process. @returns Native account/config, explicit operation contexts and real writer with controlled response loss only. */
export async function prepareAllowlistManagement(database: AcademyAdmissionTestDatabase, securityConfig?: MessagingSecurityConfig) {
  const fixture = await prepareContactVerificationDatabase(database, securityConfig);
  for (const migration of ["20261005095000_guard_global_identity_context.sql", "20261005101000_guard_admission_operation_identity.sql", "20261006200000_scope_admission_audit_operations.sql"]) await database.applyMigration(migration);
  return seedAllowlistManagement(database, fixture);
}

/** @param database - Real transaction adapter on an already migrated owned branch. @param fixture - Native account and private host keys. @returns The same leader, academy resources and real management owners used by local fixtures. */
export async function seedAllowlistManagement(database: Pick<AcademyAdmissionTestDatabase, "withContext">, fixture: Awaited<ReturnType<typeof seedContactVerificationDatabase>>) {
  const tribeId = randomUUID(), accountId = randomUUID(), sessionId = randomUUID(), subject = randomUUID(), sessionToken = randomUUID();
  await database.withContext(fixture.own, async (transaction) => {
    const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic allowlist tribe',${`allowlist-${tribeId}`},${fixture.userId})`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.userId},'leader','active')`);
    await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,requires_whatsapp_number) values (${tribeId},false)`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},'google',${subject},${now},${now})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${sessionToken},${new Date(now.getTime()+LEADER_SESSION_LIFETIME_MS)},${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
  });
  /** @param operation - Exact server-selected sensitive purpose. @param resourceId - Tribe for create or own existing entry for edit. @returns The server context of the live leader session for that exact operation. */
  const confirm = async (operation: ReauthenticationOperation, resourceId: string = tribeId): Promise<AuthorizedAdmissionContext> => {
    return { userId: fixture.userId, sessionId, tribeId, requestId: randomUUID(), role: "leader", membershipStatus: "active", resourceId, action: "manage_allowlist", sensitiveOperation: operation };
  };
  let loseReply = false;
  const writer = new PostgresAllowlistRepository(async (_context, run) => {
    const result = await database.withContext(fixture.own, run);
    if (loseReply && typeof result === "object" && result !== null && "state" in result && result.state === "completed") { loseReply = false; throw new Error("Controlled allowlist COMMIT response loss"); }
    return result;
  }, async () => fixture.config);
  return { ...fixture, tribeId, sessionId, sessionToken, confirm, writer, loseNextReply: () => { loseReply = true; } };
}
