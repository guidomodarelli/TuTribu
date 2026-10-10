/** @vitest-environment node */

/** Exercises private identity/session relationships and evidence constraints on real owned Postgres. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("auth evidence persistence", () => {
  it("should bind identity and recent evidence to the same user, account, subject, session and intent scope", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      await database.applyMigration("20261005090000_create_admission_identity_evidence.sql");
      const userA = randomUUID();
      const userB = randomUUID();
      const accountA = randomUUID();
      const accountB = randomUUID();
      const sessionA = randomUUID();
      const sessionB = randomUUID();
      const tribeId = randomUUID();
      const intentId = randomUUID();
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        for (const userId of [userA, userB]) await transaction.execute(sql`insert into public."user" (id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic auth user',${`${userId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        for (const account of [{ id: accountA, userId: userA }, { id: accountB, userId: userB }]) await transaction.execute(sql`insert into public.account (id,"userId","providerId","accountId","createdAt","updatedAt") values (${account.id},${account.userId},'google',${account.id},clock_timestamp(),clock_timestamp())`);
        for (const session of [{ id: sessionA, userId: userA }, { id: sessionB, userId: userB }]) await transaction.execute(sql`insert into public.session (id,"userId",token,"expiresAt","createdAt","updatedAt") values (${session.id},${session.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribes (id,name,slug,created_by) values (${tribeId},'Synthetic auth tribe',${`auth-${tribeId}`},${userA})`);
      });
      const insertCapture = (userId: string, version: number) => database.withContext({ userId: userA, email: null }, async (transaction) => transaction.execute(sql`
        insert into public.global_identity_evidence (user_id,account_id,provider_id,provider_subject,normalized_email,email_verified_claim,classification,issuer,audience,token_issued_at,token_expires_at,verified_at,version)
        values (${userId},${accountA},'google',${accountA},${`${userA}@example.test`},true,'insufficient','https://accounts.google.com','synthetic-client',clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp(),${version}) returning version
      `));
      // Check scope before occupying the current-capture unique key, so that
      // the FK case is not masked by an unrelated uniqueness failure.
      await expect(insertCapture(userB, 1)).rejects.toMatchObject({ cause: { code: "23503" } });
      expect((await insertCapture(userA, 1)).rows[0]).toMatchObject({ version: 1 });
      await expect(insertCapture(userA, 0)).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(insertCapture(userA, 1)).rejects.toMatchObject({ cause: { code: "23505" } });

      await database.withContext({ userId: userA, email: null }, async (transaction) => transaction.execute(sql`
        insert into public.global_reauthentication_intents (id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,expires_at)
        values (${intentId},${userA},${sessionA},${accountA},${accountA},${tribeId},'save_messaging_credentials','synthetic-connection','/auth/reauthenticate',clock_timestamp()+interval '10 minutes')
      `));
      await expect(database.withContext({ userId: userA, email: null }, async (transaction) => transaction.execute(sql`update public.global_reauthentication_intents set state='authorizing' where id=${intentId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await database.withContext({ userId: userA, email: null }, async (transaction) => transaction.execute(sql`update public.global_reauthentication_intents set state='authorizing', nonce_hash=${new Uint8Array(32)},version=version+1 where id=${intentId}`));
      await database.withContext({ userId: userA, email: null }, async (transaction) => transaction.execute(sql`update public.global_reauthentication_intents set state='consumed', consumed_at=clock_timestamp(),version=version+1 where id=${intentId}`));
      const insertRecent = (sessionId: string, operation: string, validityMinutes: number) => database.withContext({ userId: userA, email: null }, async (transaction) => transaction.execute(sql`
        insert into public.recent_authentication_evidence (intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until)
        values (${intentId},${userA},${accountA},${accountA},${sessionId},${tribeId},${operation},'synthetic-connection',clock_timestamp(),clock_timestamp(),clock_timestamp()+${validityMinutes}*interval '1 minute') returning id
      `));
      await expect(insertRecent(sessionB, "save_messaging_credentials", 9)).rejects.toMatchObject({ cause: { code: "23503" } });
      await expect(insertRecent(sessionA, "rotate_messaging_credentials", 9)).rejects.toMatchObject({ cause: { code: "23503" } });
      await expect(insertRecent(sessionA, "save_messaging_credentials", 11)).rejects.toMatchObject({ cause: { code: "23514" } });
      expect((await insertRecent(sessionA, "save_messaging_credentials", 9)).rows[0]).toMatchObject({ id: expect.any(String) });
    });
  }, 120_000);
});
