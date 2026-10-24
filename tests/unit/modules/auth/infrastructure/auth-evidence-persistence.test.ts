/** @vitest-environment node */

/** Exercises private identity capture relationships and constraints on real owned Postgres. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("auth evidence persistence", () => {
  it("should bind the identity capture to its own user and account with a positive unique version", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      await database.applyMigration("20261005090000_create_admission_identity_evidence.sql");
      const userA = randomUUID();
      const userB = randomUUID();
      const accountA = randomUUID();
      const accountB = randomUUID();
      const sessionA = randomUUID();
      const sessionB = randomUUID();
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        for (const userId of [userA, userB]) await transaction.execute(sql`insert into public."user" (id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic auth user',${`${userId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        for (const account of [{ id: accountA, userId: userA }, { id: accountB, userId: userB }]) await transaction.execute(sql`insert into public.account (id,"userId","providerId","accountId","createdAt","updatedAt") values (${account.id},${account.userId},'google',${account.id},clock_timestamp(),clock_timestamp())`);
        for (const session of [{ id: sessionA, userId: userA }, { id: sessionB, userId: userB }]) await transaction.execute(sql`insert into public.session (id,"userId",token,"expiresAt","createdAt","updatedAt") values (${session.id},${session.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
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
    });
  }, 120_000);
});
