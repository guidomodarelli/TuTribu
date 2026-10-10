/** Shares protected synthetic connection creation for actual SQL/provider workflows. @module messaging-connection-fixture */
import {randomBytes,randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import type {AcademyAdmissionTestDatabase} from "./academy-admission-database";
import {prepareContactVerificationDatabase} from "./contact-verification-database-fixture";
import {PostgresMessagingConnectionRepository} from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-connection-repository";
import type {MessagingConnectionCreationContext} from "@/src/modules/messaging/domain/repositories/messaging-connection-management";
import type {RequestDatabase} from "@/src/modules/shared/infrastructure/database/server-database-client";

/** @param database - Owned ephemeral branch. @returns Real identity/recency and a guarded connection owner without provider access. */
export async function prepareMessagingConnectionCreation(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareContactVerificationDatabase(database);
  await database.applyMigration("20261007231500_bind_verification_operation_purpose.sql");
  for (const migration of ["20261005095000_guard_global_identity_context.sql", "20261005101000_guard_admission_operation_identity.sql"]) await database.applyMigration(migration);
  const tribeId = randomUUID(), sessionId = randomUUID(), accountId = randomUUID(), subject = randomUUID(), sessionToken = randomUUID();
  const context = await database.withContext(fixture.own, async (transaction): Promise<MessagingConnectionCreationContext> => {
    const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now), validUntil = new Date(now.getTime() + 540_000), intentId = randomUUID();
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic connection tribe',${`connection-${tribeId}`},${fixture.userId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.userId},'leader','active')`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},'google',${subject},${now},${now})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${sessionToken},${new Date(now.getTime()+3_600_000)},${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
    await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.userId},${sessionId},${accountId},${subject},${tribeId},'save_messaging_credentials',${tribeId},'/synthetic-connection',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
    await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.userId},${accountId},${subject},${sessionId},${tribeId},'save_messaging_credentials',${tribeId},${now},${now},${validUntil})`);
    return { tribeId, actorUserId: fixture.userId, sessionId, accountId, subject, resourceId: tribeId, authenticatedAt: now, validUntil, requestId: randomUUID(), operation: "save_messaging_credentials" };
  });
  const execute = <Result>(_context: MessagingConnectionCreationContext, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(fixture.own, run);
  return { fixture, context, execute, sessionToken, repository: new PostgresMessagingConnectionRepository(execute, async () => fixture.config) };
}
