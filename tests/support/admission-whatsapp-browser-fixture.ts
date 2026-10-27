/** Seeds current native leader and Google-backed applicants exclusively on an owned migrated branch. @module admission-whatsapp-browser-fixture */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { prepareAllowlistManagement } from "./allowlist-management-database-fixture";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";

/** Sub-millisecond part of the synthetic activation instant. */
const ACTIVATION_SUB_MILLISECOND_OFFSET = "123 microseconds";

/** @param database - Verified disposable database. @param security - Generated hosting keys shared in memory with the real server. @returns Existing native confirmation helpers and new synthetic accounts without a sender or code. */
export async function prepareAdmissionWhatsappBrowser(database: AcademyAdmissionTestDatabase, security: MessagingSecurityConfig) {
  const fixture = await prepareAllowlistManagement(database, security);
  await database.withContext(fixture.own, async (transaction) => {
    await transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+interval '1 hour' where id=${fixture.sessionId}`);
    // PostgreSQL keeps microseconds in the activation instant, which a JavaScript Date cannot carry; the offset makes that part never zero.
    const now = (await transaction.execute<{ now: string }>(sql`select (date_trunc('milliseconds',clock_timestamp())+${ACTIVATION_SUB_MILLISECOND_OFFSET}::interval)::text as now`)).rows[0].now;
    await transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',is_open=true,activated_at=${now},version=version+1 where tribe_id=${fixture.tribeId}`);
    await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${fixture.tribeId}`);
  });
  /** @param name - Synthetic account display name used by the actual reviewer. @returns A native Google-backed account and independent unexposed session. */
  const applicant = async (name: string) => {
    const userId = randomUUID(), sessionId = randomUUID(), sessionToken = randomUUID(), accountId = randomUUID(), subject = randomUUID(), email = `whatsapp-${randomUUID()}@example.test`;
    await database.withContext(fixture.own, async (transaction) => {
      const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
      await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},${name},${email},false,${now},${now})`);
      await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${userId},'google',${subject},${now},${now})`);
      await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${sessionToken},clock_timestamp()+interval '1 hour',${now},${now})`);
      await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${userId},${accountId},${subject},${email})`);
      await transaction.execute(sql`insert into public.global_identity_evidence(id,user_id,account_id,provider_id,provider_subject,normalized_email,email_verified_claim,hosted_domain,classification,issuer,audience,token_issued_at,token_expires_at,verified_at) values (${randomUUID()},${userId},${accountId},'google',${subject},${email},true,'example.test','workspace','https://accounts.google.com','synthetic-whatsapp-client',${now},clock_timestamp()+interval '1 hour',${now})`);
    });
    return { userId, sessionId, sessionToken, email, name };
  };
  return { ...fixture, slug: `allowlist-${fixture.tribeId}`, applicant, leader: { userId: fixture.userId, sessionId: fixture.sessionId, sessionToken: fixture.sessionToken, email: fixture.own.email } };
}
