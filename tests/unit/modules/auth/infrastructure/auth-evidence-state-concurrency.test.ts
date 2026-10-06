/** @vitest-environment node */

/** Exercises state authority, recency immutability, RLS and concurrent CAS on real Postgres. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("auth evidence state and concurrent access", () => {
  it("should require consumed intent, keep issued scope immutable and permit one concurrent consumer", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      await database.applyMigration("20261005090000_create_admission_identity_evidence.sql");
      const userId = randomUUID();
      const otherUserId = randomUUID();
      const accountId = randomUUID();
      const sessionId = randomUUID();
      const tribeId = randomUUID();
      const intentId = randomUUID();
      const own = { userId, email: null };
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        for (const id of [userId,otherUserId]) await transaction.execute(sql`insert into public."user" (id,name,email,"emailVerified","createdAt","updatedAt") values (${id},'Synthetic evidence user',${`${id}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.account (id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${userId},'google',${accountId},clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.session (id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribes (id,name,slug,created_by) values (${tribeId},'Synthetic evidence tribe',${`evidence-${tribeId}`},${userId})`);
      });
      await database.withContext(own, async (transaction) => transaction.execute(sql`
        insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,expires_at)
        values (${intentId},${userId},${sessionId},${accountId},${accountId},${tribeId},'save_messaging_credentials','connection','/auth/reauthenticate',clock_timestamp()+interval '10 minutes')
      `));
      const insertEvidence = () => database.withContext(own, async (transaction) => transaction.execute(sql`
        insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until)
        values (${intentId},${userId},${accountId},${accountId},${sessionId},${tribeId},'save_messaging_credentials','connection',clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '9 minutes') returning id
      `));
      await expect(insertEvidence()).rejects.toMatchObject({ cause: { code: "23514" } });
      await database.withContext(own, async (transaction) => transaction.execute(sql`update public.global_reauthentication_intents set state='authorizing',nonce_hash=${new Uint8Array(32)},version=version+1 where id=${intentId}`));
      const consumers = await Promise.all(Array.from({ length: 2 }, () => database.withContext(own, async (transaction) => {
        const result = await transaction.execute(sql`update public.global_reauthentication_intents set state='consumed',consumed_at=clock_timestamp(),version=version+1 where id=${intentId} and state='authorizing' and version=2 returning version`);
        return result.rows;
      })));
      expect(consumers.flat()).toEqual([{ version: 3 }]);
      const inserted = await insertEvidence();
      const evidenceId = inserted.rows[0].id as string;
      await expect(insertEvidence()).rejects.toMatchObject({ cause: { code: "23505" } });
      // Shift the whole window so all pre-existing time CHECKs remain valid;
      // rejection must come from the origin/window immutability guard.
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set authenticated_at=authenticated_at+interval '1 minute',verified_at=verified_at+interval '1 minute',valid_until=valid_until+interval '1 minute' where id=${evidenceId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set operation='rotate_messaging_credentials' where id=${evidenceId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set verified_at=verified_at+interval '1 minute' where id=${evidenceId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.global_reauthentication_intents set state='authorizing',consumed_at=null,version=version+1 where id=${intentId}`))).rejects.toMatchObject({ cause: { code: "23514" } });

      await database.grantTablesToNonBypass(["global_identity_evidence","global_reauthentication_intents","recent_authentication_evidence"]);
      const ownRows = await database.withContext(own, async (transaction) => (await transaction.execute(sql`select id from public.recent_authentication_evidence where id=${evidenceId}`)).rows, "non_bypass");
      const otherRows = await database.withContext({ userId: otherUserId, email: null }, async (transaction) => (await transaction.execute(sql`select id from public.recent_authentication_evidence where id=${evidenceId}`)).rows, "non_bypass");
      expect(ownRows).toEqual([{ id: evidenceId }]);
      expect(otherRows).toEqual([]);
      const foreignUpdates = await database.withContext({ userId: otherUserId, email: null }, async (transaction) => (await transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where id=${evidenceId} returning id`)).rows, "non_bypass");
      expect(foreignUpdates).toEqual([]);

      // The owning account can invalidate evidence, but cannot revive it or
      // move that invalidation to create another authorization window.
      const invalidated = await database.withContext(own, async (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where id=${evidenceId} returning id`), "non_bypass");
      expect(invalidated.rows).toEqual([{ id: evidenceId }]);
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=null where id=${evidenceId}`), "non_bypass")).rejects.toMatchObject({ cause: { code: "23514" } });
    });
  },120_000);
});
