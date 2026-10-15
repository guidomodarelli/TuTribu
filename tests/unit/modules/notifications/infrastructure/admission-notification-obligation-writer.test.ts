/** @vitest-environment node */
/** Exercises canonical event audiences and atomic obligation/notice/audit effects with real PostgreSQL. @module admission-notification-obligation-writer-test */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { executeAdmissionMigrationCommand } from "@/tests/support/admission-migration-command";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import type { AdmissionNotificationObligation } from "@/src/modules/notifications/domain/entities/admission-notification";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/**
 * Seeds current reviewers and pending facts without any external message configuration.
 * @param database - Disposable branch verified by the existing Native harness.
 * @returns Current actors and three original source identities; the reminder request is genuinely older than three days.
 */
async function prepareWriter(database: AcademyAdmissionTestDatabase) {
  await database.withServerEnvironment((environment) => executeAdmissionMigrationCommand({ ...environment, DATABASE_MIGRATION_URL: environment.DATABASE_URL }));
  const tribeId = randomUUID(), otherTribeId = randomUUID();
  const leaderId = randomUUID(), guardianId = randomUUID(), mutedGuardianId = randomUUID(), memberId = randomUUID(), otherLeaderId = randomUUID();
  const own = { userId: leaderId, email: null };
  const obligations: AdmissionNotificationObligation[] = (["pending_created", "reminder", "rejected"] as const).map((event) => ({ id: randomUUID(), tribeId, admissionRequestId: randomUUID(), applicantUserId: randomUUID(), event }));
  await database.withContext(own, async (transaction) => {
    for (const userId of [leaderId, guardianId, mutedGuardianId, memberId, otherLeaderId, ...obligations.map((obligation) => obligation.applicantUserId)]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic notice writer actor',${`${userId}@example.invalid`},false,clock_timestamp(),clock_timestamp())`);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic notice writer',${`writer-${tribeId}`},${leaderId}),(${otherTribeId},'Other notice writer',${`writer-${otherTribeId}`},${otherLeaderId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${leaderId},'leader','active'),(${tribeId},${guardianId},'guardian','active'),(${tribeId},${mutedGuardianId},'guardian','muted'),(${tribeId},${memberId},'tribemate','active'),(${otherTribeId},${otherLeaderId},'leader','active')`);
    for (const obligation of obligations) {
      await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,submitted_at,expires_at) values (${obligation.admissionRequestId},${tribeId},${obligation.applicantUserId},'common',clock_timestamp()-interval '4 days',clock_timestamp()+interval '20 days')`);
    }
  });
  return { tribeId, otherTribeId, leaderId, guardianId, mutedGuardianId, memberId, otherLeaderId, own, obligations };
}

/**
 * Stages the terminal source in the very transaction that must also persist its obligation and notice.
 * @param transaction - Original guarded owner transaction; deferred product guards remain enabled.
 * @param fixture - Existing pending request and its planned rejection source.
 * @returns After the real decision, request transition and source audit are staged, before the writer or commit.
 */
async function stageRejectedSource(transaction: RequestDatabase, fixture: Awaited<ReturnType<typeof prepareWriter>>) {
  const obligation = fixture.obligations[2], decisionId = randomUUID();
  await transaction.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,internal_reason) values (${decisionId},${obligation.admissionRequestId},${fixture.tribeId},${obligation.applicantUserId},1,'rejected',${fixture.leaderId},'user','synthetic_notification_source',1,1,'Private reviewer canary')`);
  await transaction.execute(sql`update public.academy_admission_requests set status='rejected',decision_id=${decisionId},version=version+1 where id=${obligation.admissionRequestId}`);
  await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,event_type,rule,resource_version) values (${fixture.tribeId},${fixture.leaderId},'admission_request',${obligation.admissionRequestId},'rejected','synthetic_notification_source',2)`);
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission notification obligation writer", () => {
  it("should deliver a reminder only to current scoped reviewers and reselect reviewers for the next original event", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareWriter(database), reminder = fixture.obligations[1];
      await database.withContext(fixture.own, (transaction) => createPostgresAdmissionNotificationObligationWriter(transaction).record(reminder));
      const reminderNotices = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select recipient_user_id,admission_audience,type,payload from public.notifications where admission_obligation_id=${reminder.id} order by recipient_user_id`)).rows);
      expect(reminderNotices).toEqual([fixture.leaderId, fixture.guardianId].sort().map((userId) => ({ recipient_user_id: userId, admission_audience: "reviewer", type: "admission_reminder", payload: {} })));
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='tribemate' where tribe_id=${fixture.tribeId} and user_id=${fixture.guardianId}`));
      const pending = fixture.obligations[0];
      await database.withContext(fixture.own, (transaction) => createPostgresAdmissionNotificationObligationWriter(transaction).record(pending));
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select recipient_user_id,admission_audience,type from public.notifications where admission_obligation_id=${pending.id}`)).rows)).toEqual([{ recipient_user_id: fixture.leaderId, admission_audience: "reviewer", type: "admission_pending_created" }]);
      const audit = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select event_type,metadata->>'audience' as audience,metadata->>'sourceEvent' as source_event from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and metadata->>'obligationId'=${reminder.id} order by event_type,audience`)).rows);
      expect(audit).toEqual([{ event_type: "notification_materialized", audience: "reviewer", source_event: "reminder" }, { event_type: "notification_materialized", audience: "reviewer", source_event: "reminder" }, { event_type: "notification_obligation_created", audience: null, source_event: "reminder" }]);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${reminder.applicantUserId}`)).rows[0].count)).toBe(0);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should preserve mixed batch audiences and roll back observed obligations, notices and audit before an explicit retry", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareWriter(database);
      let staged = false;
      await expect(database.withContext(fixture.own, async (transaction) => {
        await stageRejectedSource(transaction, fixture);
        await createPostgresAdmissionNotificationObligationWriter(transaction).recordMany(fixture.obligations);
        expect((await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_notification_obligations where tribe_id=${fixture.tribeId}`)).rows[0].count).toBe(3);
        expect((await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.notifications where tribe_id=${fixture.tribeId}`)).rows[0].count).toBe(5);
        expect((await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='admission_notification'`)).rows[0].count).toBe(8);
        expect((await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='admission_request' and event_type='rejected'`)).rows[0].count).toBe(1);
        staged = true;
        throw new Error("Synthetic notification owner abort");
      })).rejects.toThrow("Synthetic notification owner abort");
      expect(staged).toBe(true);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_notification_obligations where tribe_id=${fixture.tribeId}) as obligations,(select count(*)::int from public.notifications where tribe_id=${fixture.tribeId}) as notices,(select count(*)::int from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='admission_notification') as audit`)).rows)).toEqual([{ obligations: 0, notices: 0, audit: 0 }]);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select status,decision_id from public.academy_admission_requests where id=${fixture.obligations[2].admissionRequestId}`)).rows)).toEqual([{ status: "pending", decision_id: null }]);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='admission_request' and event_type='rejected'`)).rows[0].count)).toBe(0);
      await database.withContext(fixture.own, async (transaction) => {
        await stageRejectedSource(transaction, fixture);
        await createPostgresAdmissionNotificationObligationWriter(transaction).recordMany(fixture.obligations);
      });
      const notices = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select admission_obligation_id,recipient_user_id,admission_audience,type,payload from public.notifications where tribe_id=${fixture.tribeId} order by admission_obligation_id,recipient_user_id`)).rows);
      const expected = fixture.obligations.flatMap((obligation) => (obligation.event === "rejected" ? [obligation.applicantUserId] : [fixture.leaderId, fixture.guardianId]).map((userId) => ({ admission_obligation_id: obligation.id, recipient_user_id: userId, admission_audience: obligation.event === "rejected" ? "applicant" : "reviewer", type: `admission_${obligation.event}`, payload: {} }))).sort((first, second) => first.admission_obligation_id.localeCompare(second.admission_obligation_id) || first.recipient_user_id.localeCompare(second.recipient_user_id));
      expect(notices).toEqual(expected);
      await expect(database.withContext(fixture.own, (transaction) => createPostgresAdmissionNotificationObligationWriter(transaction).recordMany(fixture.obligations))).rejects.toMatchObject({ cause: { code: "23505" } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='admission_notification'`)).rows[0].count)).toBe(8);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
