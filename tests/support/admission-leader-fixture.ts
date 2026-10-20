/** Seeds one academy tribe whose leader has a live native session bound to its Google identity. @module admission-leader-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareContactVerificationDatabase } from "./contact-verification-database-fixture";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";

/**
 * @param database - Owned branch with the real migration journal.
 * @param options - Session lifetime and the hosting keys a native server shares with the seed.
 * @returns Leader identifiers, the raw session token (held only in memory) and the slug.
 */
export async function prepareAdmissionLeader(database: AcademyAdmissionTestDatabase, options: { sessionLifetimeMs: number; securityConfig?: MessagingSecurityConfig }) {
  const fixture = await prepareContactVerificationDatabase(database, options.securityConfig);
  const tribeId = randomUUID(), accountId = randomUUID(), sessionId = randomUUID(), subject = randomUUID(), sessionToken = randomUUID(), slug = `leader-${tribeId}`;
  await database.withContext(fixture.own, async (transaction) => {
    const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic leader tribe',${slug},${fixture.userId})`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.userId},'leader','active')`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},'google',${subject},${now},${now})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${sessionToken},${new Date(now.getTime() + options.sessionLifetimeMs)},${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
  });
  return { fixture, tribeId, slug, sessionId, sessionToken };
}
