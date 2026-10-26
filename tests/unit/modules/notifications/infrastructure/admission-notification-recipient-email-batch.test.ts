/** @vitest-environment node */
/** Exercises real current recipient batches without provider calls or cached cross-transaction authority. @module admission-notification-recipient-email-batch-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationCollectionProgress } from "@/tests/support/admission-notification-collection-progress-fixture";
import { withAdmissionTransitionContention } from "@/tests/support/admission-transition-contention";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { PostgresAdmissionNotificationRecipientEmailReader } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-recipient-email-reader";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission recipient email batch", () => {
  it("should resolve every one of a thousand original notices with one runtime snapshot and forget a genuinely retired source on the next read", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationCollectionProgress(database), created = await fixture.createSources(1000);
      const scope = { tribeId: fixture.tribeId, recipientUserId: fixture.leaderId, audience: "reviewer" as const, obligationIds: created.sources.map((source) => source.obligation_id) };
      const runtime = { environment: fixture.keys.config.environment, securityEpoch: fixture.keys.config.securityEpoch };
      await fixture.execute(async (transaction) => {
        let runtimeReads = 0;
        const reader = new PostgresAdmissionNotificationRecipientEmailReader(transaction, async () => { runtimeReads += 1; return runtime; });
        const small = await reader.readBatch({ ...scope, obligationIds: scope.obligationIds.slice(0, 2) });
        expect(small.size).toBe(2);
        expect(runtimeReads).toBe(1);
        runtimeReads = 0;
        const all = await reader.readBatch(scope);
        expect(all.size).toBe(created.sources.length);
        expect(runtimeReads).toBe(1);
        expect(created.sources.every((source) => {
          const destination = all.get(source.obligation_id);
          return destination?.tribeId === scope.tribeId && destination.recipientUserId === scope.recipientUserId && destination.audience === scope.audience && destination.obligationId === source.obligation_id && destination.normalizedEmail === `${fixture.leaderId}@gmail.com`;
        })).toBe(true);
        runtimeReads = 0;
        expect((await reader.readBatch({ ...scope, obligationIds: [] })).size).toBe(0);
        expect((await reader.readBatch({ ...scope, tribeId: fixture.otherTribeId })).size).toBe(0);
        expect(runtimeReads).toBe(0);
        expect((await transaction.execute(sql`select count(*)::int as deliveries from public.message_deliveries where tribe_id=${fixture.tribeId} and purpose='admission_notification'`)).rows).toEqual([{ deliveries: 0 }]);
      });
      await database.withContext({ userId: created.sources[1].user_id, email: null }, (transaction) => transaction.execute(sql`delete from public."user" where id=${created.sources[1].user_id}`));
      const current = await fixture.execute((transaction) => new PostgresAdmissionNotificationRecipientEmailReader(transaction, async () => runtime).readBatch(scope));
      expect(current.size).toBe(created.sources.length - 1);
      expect(current.has(created.sources[1].obligation_id)).toBe(false);
      expect(created.sources.filter((source) => source.obligation_id !== created.sources[1].obligation_id).every((source) => current.has(source.obligation_id))).toBe(true);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should reject the whole current recipient batch after real capture and reviewer-role lock waits", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationCollectionProgress(database), created = await fixture.createSources(3);
      const runtime = { environment: fixture.keys.config.environment, securityEpoch: fixture.keys.config.securityEpoch };
      const leaderScope = { tribeId: fixture.tribeId, recipientUserId: fixture.leaderId, audience: "reviewer" as const, obligationIds: created.sources.map((source) => source.obligation_id) };
      const guardianScope = { ...leaderScope, recipientUserId: fixture.guardianId };
      const read = (scope: typeof leaderScope) => database.withContext(fixture.system, (transaction) => new PostgresAdmissionNotificationRecipientEmailReader(transaction, async () => runtime).readBatch(scope));
      expect((await read(leaderScope)).size).toBe(created.sources.length);
      const capture = await withAdmissionTransitionContention(database, fixture.system, async (transaction) => {
        await transaction.execute(sql`select id from public.account where id=${fixture.accountIds.get(fixture.leaderId)!} for update`);
        await transaction.execute(sql`update public.global_identity_evidence set invalidated_at=clock_timestamp(),invalidation_reason='synthetic_batch_capture_retirement' where user_id=${fixture.leaderId} and invalidated_at is null`);
      }, () => read(leaderScope));
      expect(capture.status).toBe("fulfilled");
      if (capture.status !== "fulfilled") throw new Error("Native recipient batch capture wait did not complete");
      expect(capture.value.size).toBe(0);
      expect((await read(guardianScope)).size).toBe(created.sources.length);
      const role = await withAdmissionTransitionContention(database, fixture.own, async (transaction) => {
        await transaction.execute(sql`select id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${fixture.guardianId} for update`);
        await transaction.execute(sql`update public.tribe_members set role='tribemate' where tribe_id=${fixture.tribeId} and user_id=${fixture.guardianId}`);
      }, () => read(guardianScope));
      expect(role.status).toBe("fulfilled");
      if (role.status !== "fulfilled") throw new Error("Native recipient batch role wait did not complete");
      expect(role.value.size).toBe(0);
    }, { concurrentTransactions: 3 });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
