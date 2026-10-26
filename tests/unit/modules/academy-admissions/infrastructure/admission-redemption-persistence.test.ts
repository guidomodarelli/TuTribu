/** @vitest-environment node */

/** Exercises one-use invitation redemption and its deferred request relationship on real Postgres. */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("admission invitation redemption", () => {
  it("should commit one redemption with its own request and prevent another account from recycling it", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      await database.applyMigration("20261005090000_create_admission_identity_evidence.sql");
      await database.applyMigration("20261005091000_create_academy_admission_core.sql");
      const userId = randomUUID();
      const otherUserId = randomUUID();
      const tribeId = randomUUID();
      const invitationId = randomUUID();
      const requestId = randomUUID();
      const own = { userId, email: null };
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        for (const accountId of [userId,otherUserId]) await transaction.execute(sql`insert into public."user" (id,name,email,"emailVerified","createdAt","updatedAt") values (${accountId},'Synthetic redemption account',${`${accountId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribes (id,name,slug,created_by) values (${tribeId},'Synthetic redemption tribe',${`redemption-${tribeId}`},${userId})`);
        await transaction.execute(sql`
          insert into public.academy_personal_invitations (id,tribe_id,created_by_user_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,token_hash,token_key_id)
          values (${invitationId},${tribeId},${userId},'email',${`${userId}@example.test`},${randomBytes(32)},'synthetic-fingerprint',${randomBytes(32)},'synthetic-token')
        `);
      });
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.academy_personal_invitations set status='redeemed',redeemed_by_user_id=${userId},redeemed_request_id=${requestId},redeemed_at=clock_timestamp(),version=version+1 where id=${invitationId}`))).rejects.toMatchObject({ code: "23503" });
      await database.withContext(own, async (transaction) => {
        await transaction.execute(sql`update public.academy_personal_invitations set status='redeemed',redeemed_by_user_id=${userId},redeemed_request_id=${requestId},redeemed_at=clock_timestamp(),version=version+1 where id=${invitationId} and status='active' and version=1`);
        await transaction.execute(sql`
          with instant as (select clock_timestamp() as now)
          insert into public.academy_admission_requests (id,tribe_id,user_id,source,invitation_id,submitted_at,expires_at)
          select ${requestId},${tribeId},${userId},'personal',${invitationId},now,now+interval '30 days' from instant
        `);
      });
      const reused = await database.withContext(own, async (transaction) => (await transaction.execute(sql`update public.academy_personal_invitations set status='redeemed',redeemed_by_user_id=${userId},redeemed_request_id=${requestId},redeemed_at=clock_timestamp(),version=version+1 where id=${invitationId} and status='active' and version=1 returning id`)).rows);
      expect(reused).toEqual([]);
      await expect(database.withContext({ userId: otherUserId, email: null }, async (transaction) => transaction.execute(sql`
        with instant as (select clock_timestamp() as now)
        insert into public.academy_admission_requests (tribe_id,user_id,source,invitation_id,submitted_at,expires_at)
        select ${tribeId},${otherUserId},'personal',${invitationId},now,now+interval '30 days' from instant
      `))).rejects.toMatchObject({ code: "23503" });
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.academy_personal_invitations set status='active',redeemed_by_user_id=null,redeemed_request_id=null,redeemed_at=null,version=version+1 where id=${invitationId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      const state = await database.withContext(own, async (transaction) => (await transaction.execute(sql`select status,version,redeemed_by_user_id,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows);
      expect(state).toEqual([{ status: "redeemed", version: 2, redeemed_by_user_id: userId, redeemed_request_id: requestId }]);
      expect(await database.withContext(own, async (transaction) => (await transaction.execute(sql`select id from public.tribe_members where tribe_id=${tribeId} and user_id=${userId}`)).rows)).toEqual([]);
    });
  }, 120_000);
});
