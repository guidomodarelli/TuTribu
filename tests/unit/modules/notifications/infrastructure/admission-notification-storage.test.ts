/** @vitest-environment node */
/**
 * Exercises admission notification identity, atomicity and visibility on owned SQL branches.
 *
 * @module admission-notification-storage
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { PostgresNotificationRepository } from "@/src/modules/notifications/infrastructure/repositories/postgres-notification-repository";

/**
 * Creates unrelated tribes and actors without providing community membership to applicants.
 * @param database - Disposable Neon branch owned by this test.
 * @returns The persisted request, obligation and actor identities.
 */
async function prepareNotifications(database: AcademyAdmissionTestDatabase) {
  for (const migration of [
    "20261005090000_create_admission_identity_evidence.sql",
    "20261005091000_create_academy_admission_core.sql",
    "20261006220000_extend_admission_notifications.sql",
  ]) await database.applyMigration(migration);
  const applicantId = randomUUID(), otherApplicantId = randomUUID();
  const leaderId = randomUUID(), guardianId = randomUUID(), otherLeaderId = randomUUID();
  const tribeId = randomUUID(), otherTribeId = randomUUID();
  const requestId = randomUUID(), otherRequestId = randomUUID(), obligationId = randomUUID();
  const own = { userId: leaderId, email: null };
  await database.withContext(own, async (transaction) => {
    for (const userId of [applicantId, otherApplicantId, leaderId, guardianId, otherLeaderId]) {
      await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic notification actor',${`${userId}@example.invalid`},false,clock_timestamp(),clock_timestamp())`);
    }
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic notification tribe',${`notice-${tribeId}`},${leaderId}),(${otherTribeId},'Synthetic other tribe',${`notice-${otherTribeId}`},${otherLeaderId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active'),(${tribeId},${guardianId},'guardian','active'),(${otherTribeId},${otherLeaderId},'leader','active')`);
    await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,expires_at) values (${requestId},${tribeId},${applicantId},'common',clock_timestamp()+interval '29 days'),(${otherRequestId},${otherTribeId},${otherApplicantId},'common',clock_timestamp()+interval '29 days')`);
    await transaction.execute(sql`insert into public.academy_admission_notification_obligations(id,tribe_id,request_id,applicant_user_id,event_type) values (${obligationId},${tribeId},${requestId},${applicantId},'pending_created')`);
  });
  // The existing invoker-rights community predicate reads the actor's membership.
  await database.grantTablesToNonBypass(["notifications", "tribe_members"]);
  return { applicantId, otherApplicantId, leaderId, guardianId, otherLeaderId, tribeId, otherTribeId, requestId, otherRequestId, obligationId, own };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("admission notification storage", () => {
  it("should show and mark only the actual applicant notice through the inbox without membership or private request text", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotifications(database);
      await database.applyMigration("20261007003000_read_admission_notification_subject.sql");
      await database.grantTablesToNonBypass(["tribes", "tribe_invitations", "events", "event_occurrence_exceptions", "event_proposals"]);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select public.enqueue_admission_notification(${fixture.obligationId}::uuid,${fixture.applicantId},'applicant')`));
      const inbox = new PostgresNotificationRepository((run) => database.withContext({ userId: fixture.applicantId, email: null }, run, "non_bypass"));
      const result = await inbox.getInbox({ limit: 30, unreadCountCap: 100 });
      expect(result.unreadCount).toBe(1);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]).toMatchObject({ type: "admission_pending_created", tribe: { slug: `notice-${fixture.tribeId}` }, admission: { requestId: fixture.requestId, audience: "applicant" } });
      expect(result.notifications[0]).not.toHaveProperty("internalReason");
      expect(result.notifications[0]).not.toHaveProperty("contact");
      expect((await database.withContext({ userId: fixture.applicantId, email: null }, async (transaction) => (await transaction.execute<{ allowed: boolean }>(sql`select public.can_read_tribe_content(${fixture.tribeId}::uuid) as allowed`)).rows[0], "non_bypass")).allowed).toBe(false);
      expect(await database.withContext({ userId: fixture.otherApplicantId, email: null }, async (transaction) => (await transaction.execute(sql`select * from public.read_admission_notification_subject(${result.notifications[0].id}::uuid)`)).rows, "non_bypass")).toEqual([]);
      expect(await inbox.markRead({ notificationId: result.notifications[0].id, unreadCountCap: 100 })).toMatchObject({ status: "marked", unreadCount: 0 });
      const foreignInbox = new PostgresNotificationRepository((run) => database.withContext({ userId: fixture.otherApplicantId, email: null }, run, "non_bypass"));
      expect(await foreignInbox.getInbox({ limit: 30, unreadCountCap: 100 })).toEqual({ notifications: [], unreadCount: 0 });
      expect(await foreignInbox.markRead({ notificationId: result.notifications[0].id, unreadCountCap: 100 })).toEqual({ status: "not_found" });
    });
  }, 120_000);

  it("should remove reviewer notices and deny their mutation after the current role is revoked, including owner runtime", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotifications(database);
      await database.applyMigration("20261007003000_read_admission_notification_subject.sql");
      await database.grantTablesToNonBypass(["tribes", "tribe_invitations", "events", "event_occurrence_exceptions", "event_proposals"]);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select public.enqueue_admission_notification(${fixture.obligationId}::uuid,${fixture.guardianId},'reviewer')`));
      for (const role of ["runtime", "non_bypass"] as const) {
        const inbox = new PostgresNotificationRepository((run) => database.withContext({ userId: fixture.guardianId, email: null }, run, role));
        const active = await inbox.getInbox({ limit: 30, unreadCountCap: 100 });
        expect(active).toMatchObject({ unreadCount: 1, notifications: [{ admission: { requestId: fixture.requestId, audience: "reviewer" } }] });
      }
      const noticeId = (await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ id: string }>(sql`select id from public.notifications where recipient_user_id=${fixture.guardianId} and admission_obligation_id=${fixture.obligationId}`)).rows[0])).id;
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='tribemate' where tribe_id=${fixture.tribeId} and user_id=${fixture.guardianId}`));
      for (const role of ["runtime", "non_bypass"] as const) {
        const inbox = new PostgresNotificationRepository((run) => database.withContext({ userId: fixture.guardianId, email: null }, run, role));
        expect(await inbox.getInbox({ limit: 30, unreadCountCap: 100 })).toEqual({ notifications: [], unreadCount: 0 });
        expect(await inbox.markRead({ notificationId: noticeId, unreadCountCap: 100 })).toEqual({ status: "not_found" });
        expect(await inbox.markAllRead({ unreadCountCap: 100 })).toMatchObject({ markedCount: 0, unreadCount: 0 });
      }
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select read_at from public.notifications where id=${noticeId}`)).rows)).toEqual([{ read_at: null }]);
    });
  }, 120_000);

  it("should materialize one minimal notice per recipient and obligation under concurrent replay", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotifications(database);
      const results = await Promise.all([0, 1].map(() => database.withContext(fixture.own, async (transaction) => {
        return (await transaction.execute<{ inserted: boolean }>(sql`select public.enqueue_admission_notification(${fixture.obligationId}::uuid,${fixture.applicantId},'applicant') as inserted`)).rows[0].inserted;
      })));
      expect(results.sort()).toEqual([false, true]);
      await database.withContext(fixture.own, async (transaction) => {
        const rows = (await transaction.execute(sql`select recipient_user_id,tribe_id,type,payload,admission_obligation_id,admission_audience,read_at from public.notifications where admission_obligation_id=${fixture.obligationId}`)).rows;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ recipient_user_id: fixture.applicantId, tribe_id: fixture.tribeId, type: "admission_pending_created", payload: {}, admission_obligation_id: fixture.obligationId, admission_audience: "applicant", read_at: null });
      });
    });
  }, 120_000);

  it("should show only the applicant's own request notices without opening community content", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotifications(database);
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`select public.enqueue_admission_notification(${fixture.obligationId}::uuid,${fixture.applicantId},'applicant')`);
        await transaction.execute(sql`insert into public.notifications(recipient_user_id,tribe_id,type,dedupe_key,payload) values (${fixture.applicantId},${fixture.tribeId},'event_recording_available',${randomUUID()},'{}'),(${fixture.otherApplicantId},${fixture.tribeId},'event_recording_available',${randomUUID()},'{}')`);
      });
      await database.withContext({ userId: fixture.applicantId, email: null }, async (transaction) => {
        expect((await transaction.execute<{ allowed: boolean }>(sql`select public.can_read_tribe_content(${fixture.tribeId}::uuid) as allowed`)).rows[0].allowed).toBe(false);
        expect((await transaction.execute(sql`select type,recipient_user_id from public.notifications`)).rows).toEqual([{ type: "admission_pending_created", recipient_user_id: fixture.applicantId }]);
      }, "non_bypass");
      await database.withContext({ userId: fixture.otherApplicantId, email: null }, async (transaction) => {
        expect((await transaction.execute(sql`select id from public.notifications`)).rows).toHaveLength(0);
      }, "non_bypass");
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id from public.notifications where recipient_user_id=public.current_app_user_id()`)).rows).toHaveLength(0);
      }, "non_bypass");
    });
  }, 120_000);

  it("should recheck the current reviewer role while preserving ordinary community notices", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotifications(database);
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`select public.enqueue_admission_notification(${fixture.obligationId}::uuid,${fixture.guardianId},'reviewer')`);
        await transaction.execute(sql`insert into public.notifications(recipient_user_id,tribe_id,type,dedupe_key,payload) values (${fixture.guardianId},${fixture.tribeId},'event_recording_available',${randomUUID()},'{}')`);
      });
      const read = () => database.withContext({ userId: fixture.guardianId, email: null }, async (transaction) => (await transaction.execute(sql`select type from public.notifications order by type`)).rows, "non_bypass");
      expect(await read()).toEqual([{ type: "admission_pending_created" }, { type: "event_recording_available" }]);
      await database.withContext(fixture.own, async (transaction) => { await transaction.execute(sql`update public.tribe_members set role='tribemate' where tribe_id=${fixture.tribeId} and user_id=${fixture.guardianId}`); });
      expect(await read()).toEqual([{ type: "event_recording_available" }]);
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`select public.enqueue_admission_notification(${fixture.obligationId}::uuid,${fixture.guardianId},'reviewer')`))).rejects.toMatchObject({ cause: { code: "42501" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`select public.enqueue_admission_notification(${fixture.obligationId}::uuid,${fixture.otherLeaderId},'reviewer')`))).rejects.toMatchObject({ cause: { code: "42501" } });
    });
  }, 120_000);

  it("should roll back the obligation and its notice together and deny a recipient's private producer access", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotifications(database);
      const cancelledObligationId = randomUUID();
      await expect(database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.academy_admission_notification_obligations(id,tribe_id,request_id,applicant_user_id,event_type) values (${cancelledObligationId},${fixture.tribeId},${fixture.requestId},${fixture.applicantId},'cancelled')`);
        await transaction.execute(sql`select public.enqueue_admission_notification(${cancelledObligationId}::uuid,${fixture.applicantId},'applicant')`);
        throw new Error("Synthetic notification rollback");
      })).rejects.toThrow("Synthetic notification rollback");
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id from public.academy_admission_notification_obligations where id=${cancelledObligationId}`)).rows).toHaveLength(0);
        expect((await transaction.execute(sql`select id from public.notifications where admission_obligation_id=${cancelledObligationId}`)).rows).toHaveLength(0);
      });
      await expect(database.withContext({ userId: fixture.applicantId, email: null }, (transaction) => transaction.execute(sql`select public.enqueue_admission_notification(${fixture.obligationId}::uuid,${fixture.applicantId},'applicant')`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
    });
  }, 120_000);

  it("should reject crossed or rewritten sources and preserve a read notice when replayed", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotifications(database);
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`select public.enqueue_admission_notification(${fixture.obligationId}::uuid,${fixture.applicantId},'applicant')`);
      });
      await database.withContext({ userId: fixture.applicantId, email: null }, async (transaction) => {
        expect((await transaction.execute(sql`update public.notifications set read_at=clock_timestamp() where admission_obligation_id=${fixture.obligationId} returning id`)).rows).toHaveLength(1);
      }, "non_bypass");
      const original = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id,read_at from public.notifications where admission_obligation_id=${fixture.obligationId}`)).rows[0]);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute<{ inserted: boolean }>(sql`select public.enqueue_admission_notification(${fixture.obligationId}::uuid,${fixture.applicantId},'applicant') as inserted`)).rows[0].inserted).toBe(false);
        expect((await transaction.execute(sql`select id,read_at from public.notifications where admission_obligation_id=${fixture.obligationId}`)).rows[0]).toEqual(original);
      });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.notifications(recipient_user_id,tribe_id,type,dedupe_key,admission_obligation_id,admission_audience) values (${fixture.guardianId},${fixture.otherTribeId},'admission_pending_created',${`admission:${fixture.obligationId}`},${fixture.obligationId},'reviewer')`))).rejects.toMatchObject({ cause: { code: "23503" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.notifications(recipient_user_id,tribe_id,type,dedupe_key,admission_obligation_id,admission_audience) values (${fixture.applicantId},${fixture.tribeId},'admission_approved',${`admission:${fixture.obligationId}`},${fixture.obligationId},'applicant')`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.notifications set admission_audience='reviewer' where id=${original.id}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_notification_obligations set event_type='approved' where id=${fixture.obligationId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`select public.enqueue_admission_notification(${fixture.obligationId}::uuid,${fixture.otherApplicantId},'applicant')`))).rejects.toMatchObject({ cause: { code: "42501" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.notifications(recipient_user_id,tribe_id,type,dedupe_key,admission_obligation_id,admission_audience,payload) values (${fixture.applicantId},${fixture.tribeId},'admission_pending_created',${`admission:${fixture.obligationId}`},${fixture.obligationId},'applicant','{"contact":"synthetic@example.invalid"}')`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.notifications(recipient_user_id,tribe_id,type,dedupe_key,admission_obligation_id) values (${fixture.applicantId},${fixture.tribeId},'admission_pending_created',${`admission:${fixture.obligationId}`},${fixture.obligationId})`))).rejects.toMatchObject({ cause: { code: "23514" } });
    });
  }, 120_000);
});
