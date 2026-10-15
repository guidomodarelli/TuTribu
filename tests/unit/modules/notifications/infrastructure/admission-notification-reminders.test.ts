/** @vitest-environment node */
/** Exercises bounded native reminder materialization, current audiences, contention and atomic rollback. @module admission-notification-reminders-test */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationReminders, materializeAdmissionNotificationReminders } from "@/tests/support/admission-notification-reminder-fixture";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission notification reminders", () => {
  it("should materialize one logical reminder per due request with current reviewer notices under concurrent replay", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationReminders(database);
      const attempts = await Promise.allSettled([1, 1].map((limit) => materializeAdmissionNotificationReminders(database, limit)));
      if (!attempts.some((attempt) => attempt.status === "fulfilled")) {
        const failure = attempts.find((attempt) => attempt.status === "rejected");
        const code = failure?.status === "rejected" && typeof failure.reason?.cause?.code === "string" ? failure.reason.cause.code : "unavailable";
        throw new Error(`Native reminder materialization failed: SQLSTATE ${code}`, { cause: failure?.status === "rejected" ? failure.reason : undefined });
      }
      const createdCounts = attempts.flatMap((attempt) => attempt.status === "fulfilled" ? [attempt.value] : []);
      expect(createdCounts).toHaveLength(2);
      expect(createdCounts.every((count) => count === 0 || count === 1)).toBe(true);
      const concurrentCreated = createdCounts.reduce((total, count) => total + count, 0);
      expect(concurrentCreated).toBeGreaterThanOrEqual(1);
      expect(concurrentCreated + await materializeAdmissionNotificationReminders(database, 100)).toBe(2);
      expect(await materializeAdmissionNotificationReminders(database, 100)).toBe(0);
      const sources = await database.withContext(fixture.system, async (transaction) => (await transaction.execute(sql`select request_id,event_type from public.academy_admission_notification_obligations where event_type='reminder' order by request_id`)).rows);
      expect(sources).toEqual([fixture.requestIds[0], fixture.requestIds[3]].sort().map((requestId) => ({ request_id: requestId, event_type: "reminder" })));
      const notices = await database.withContext(fixture.system, async (transaction) => (await transaction.execute(sql`select notice.tribe_id,notice.recipient_user_id,notice.admission_audience,notice.type,notice.payload from public.notifications notice join public.academy_admission_notification_obligations obligation on obligation.id=notice.admission_obligation_id where obligation.event_type='reminder' order by notice.tribe_id,notice.recipient_user_id`)).rows);
      const expected = [{ tribe_id: fixture.tribeId, recipient_user_id: fixture.leaderId }, { tribe_id: fixture.tribeId, recipient_user_id: fixture.guardianId }, { tribe_id: fixture.otherTribeId, recipient_user_id: fixture.otherLeaderId }].map((row) => ({ ...row, admission_audience: "reviewer", type: "admission_reminder", payload: {} })).sort((first, second) => first.tribe_id.localeCompare(second.tribe_id) || first.recipient_user_id.localeCompare(second.recipient_user_id));
      expect(notices).toEqual(expected);
      expect(await database.withContext(fixture.system, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_audit_events where resource_type='admission_notification'`)).rows[0].count)).toBe(5);
      expect(await database.withContext(fixture.system, async (transaction) => (await transaction.execute(sql`select distinct status,version,decision_id from public.academy_admission_requests where id in (${sql.join(fixture.requestIds.map((requestId) => sql`${requestId}::uuid`), sql`,`)})`)).rows)).toEqual([{ status: "pending", version: 1, decision_id: null }]);
      expect(await database.withContext(fixture.system, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.tribe_members where user_id in (${sql.join(fixture.applicantIds.map((userId) => sql`${userId}`), sql`,`)})`)).rows[0].count)).toBe(0);
    }, { concurrentTransactions: 2 });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should skip a held tribe before limiting work and catch it up after the original fence is released", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationReminders(database);
      const [busyTribeId, freeTribeId] = [fixture.tribeId, fixture.otherTribeId].sort();
      let releaseFence!: () => void, reportLocked!: () => void;
      const released = new Promise<void>((resolve) => { releaseFence = resolve; }), locked = new Promise<void>((resolve) => { reportLocked = resolve; });
      const holder = database.withContext(fixture.system, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${busyTribeId} for update`);
        reportLocked();
        await released;
      });
      try {
        await Promise.race([locked, holder.then(() => { throw new Error("Synthetic tribe holder finished before its lock signal"); })]);
        const created = await database.withContext(fixture.system, async (transaction) => {
          await transaction.execute(sql`set local lock_timeout='2s'`);
          return (await transaction.execute<{ created: number }>(sql`select public.materialize_admission_notification_reminders(1) as created`)).rows[0].created;
        });
        expect(created).toBe(1);
        expect(await database.withContext(fixture.system, async (transaction) => (await transaction.execute(sql`select tribe_id from public.academy_admission_notification_obligations where event_type='reminder'`)).rows)).toEqual([{ tribe_id: freeTribeId }]);
      } finally {
        releaseFence();
        await holder;
      }
      expect(await materializeAdmissionNotificationReminders(database, 1)).toBe(1);
      expect(await materializeAdmissionNotificationReminders(database, 1)).toBe(0);
    }, { concurrentTransactions: 2 });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should roll back observed reminder effects and deny direct request execution or invalid batch sizes", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationReminders(database);
      let staged = false;
      await expect(database.withContext(fixture.system, async (transaction) => {
        expect((await transaction.execute<{ created: number }>(sql`select public.materialize_admission_notification_reminders(100) as created`)).rows[0].created).toBe(2);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_notification_obligations where event_type='reminder') as obligations,(select count(*)::int from public.notifications where type='admission_reminder') as notices,(select count(*)::int from public.academy_admission_audit_events where resource_type='admission_notification') as audit`)).rows).toEqual([{ obligations: 2, notices: 3, audit: 5 }]);
        staged = true;
        throw new Error("Synthetic reminder owner abort");
      })).rejects.toThrow("Synthetic reminder owner abort");
      expect(staged).toBe(true);
      expect(await database.withContext(fixture.system, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_notification_obligations where event_type='reminder') as obligations,(select count(*)::int from public.notifications where type='admission_reminder') as notices,(select count(*)::int from public.academy_admission_audit_events where resource_type='admission_notification') as audit`)).rows)).toEqual([{ obligations: 0, notices: 0, audit: 0 }]);
      await expect(database.withContext({ userId: fixture.leaderId, email: null }, (transaction) => transaction.execute(sql`select public.materialize_admission_notification_reminders(1)`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
      for (const limit of [0, 101, null]) await expect(database.withContext(fixture.system, (transaction) => transaction.execute(sql`select public.materialize_admission_notification_reminders(${limit})`))).rejects.toMatchObject({ cause: { code: "23514" } });
      expect(await materializeAdmissionNotificationReminders(database, 100)).toBe(2);
      expect(await materializeAdmissionNotificationReminders(database, 100)).toBe(0);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
