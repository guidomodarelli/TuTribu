/** @vitest-environment node */
/** Exercises original notification collection with real trust, selected capability, preferences and private PostgreSQL storage. @module admission-notification-collection-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationCollection } from "@/tests/support/admission-notification-collection-fixture";
import { createAdmissionRequestSnapshotFixture } from "@/tests/support/admission-request-snapshot-fixture";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { PostgresAdmissionNotificationRepository } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-repository";
import type { AdmissionNotificationRecipientEmailScope } from "@/src/modules/notifications/domain/entities/admission-notification-recipient-email";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission notification collection", () => {
  it("should collect each current trusted notice once without outbox effects and preserve its original group across preference changes", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given genuine account evidence installed before its original guard, and a selected encrypted email resource under all current guards.
      const { fixture, keys, connectionId } = await prepareAdmissionNotificationCollection(database);
      /** @param transaction - Existing synthetic native owner transaction. @param tribeId - Exact protected producer scope. @returns Current canonical owner authority, not a browser flag or a test of the future bearer endpoint. */
      const authorize = async (transaction: RequestDatabase, tribeId: string) => tribeId === fixture.tribeId && Boolean((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${tribeId} and user_id=public.current_app_user_id() and role='leader' and status='active'`)).rows[0]);
      /** @param scope - Existing exact original notice. @returns The committed collection result, never a simulated sender receipt. */
      const collect = (scope: AdmissionNotificationRecipientEmailScope) => database.withContext(fixture.own, (transaction) => new PostgresAdmissionNotificationRepository(transaction, authorize, async () => keys.config).collect(scope));
      /** @returns One real new pending source with current reviewer notices, preserving the internal fact even when email is omitted. */
      const createSource = async () => {
        const requestId = randomUUID(), obligationId = randomUUID(), applicantId = randomUUID();
        await database.withContext(fixture.own, async (transaction) => {
          await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${applicantId},'Synthetic collection applicant',${`${applicantId}@example.invalid`},false,clock_timestamp(),clock_timestamp())`);
          const snapshot = createAdmissionRequestSnapshotFixture({ id: requestId, tribeId: fixture.tribeId, userId: applicantId, submittedAt: new Date() });
          await transaction.execute(sql`with original_clock as materialized(select clock_timestamp() as submitted_at)
            insert into public.academy_admission_requests(id,tribe_id,user_id,source,original_policy_snapshot,submitted_at,expires_at)
            select ${requestId},${fixture.tribeId},${applicantId},'common',${JSON.stringify(snapshot)}::jsonb,submitted_at,submitted_at+interval '30 days' from original_clock`);
          await transaction.execute(sql`select public.create_admission_notification_obligation(${obligationId},${fixture.tribeId},${requestId},${applicantId},'pending_created')`);
          for (const userId of [fixture.leaderId, fixture.guardianId]) await transaction.execute(sql`select public.enqueue_admission_notification(${obligationId},${userId},'reviewer')`);
        });
        return { tribeId: fixture.tribeId, obligationId, recipientUserId: fixture.leaderId, audience: "reviewer" as const };
      };
      const scope = await createSource();

      // When competing owner transactions collect the same original notice, only one immutable logical member is created.
      const results = await Promise.all([collect(scope), collect(scope)]);
      expect(results.map((result) => result.status).sort()).toEqual(["collected", "existing"]);
      const first = results.find((result) => result.status === "collected");
      if (first?.status !== "collected") throw new Error("Native collection did not create its original group");
      expect(await collect({ ...scope, recipientUserId: fixture.guardianId })).toEqual({ status: "suppressed", reason: "preference_omitted" });
      expect(await collect(fixture.reviewScope)).toEqual({ status: "suppressed", reason: "event_predates_email_enablement" });
      await expect(collect({ ...scope, tribeId: fixture.otherTribeId })).rejects.toMatchObject({ code: "permission_denied" });
      expect(await collect({ ...scope, obligationId: randomUUID() })).toEqual({ status: "unavailable" });

      // Then disabling a preference preserves the existing lineage without authorizing another group or any external delivery.
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.admission_notification_preferences(tribe_id,recipient_user_id,mode,version) values (${fixture.tribeId},${fixture.leaderId},'omitted',1)`));
      expect(await collect(scope)).toEqual({ status: "existing", groupId: first.groupId, memberState: "pending" });
      expect(await collect(await createSource())).toEqual({ status: "suppressed", reason: "preference_omitted" });
      const facts = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.admission_notification_groups where tribe_id=${fixture.tribeId}) as groups,(select count(*)::int from public.admission_notification_group_members where tribe_id=${fixture.tribeId}) as members,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId} and purpose='admission_notification') as deliveries`)).rows[0]);
      expect(facts).toEqual({ groups: 1, members: 1, deliveries: 0 });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select frozen_manifest,deadline_at from public.admission_notification_groups where id=${first.groupId}`)).rows[0])).toEqual({ frozen_manifest: null, deadline_at: null });

      // A denial after observing the staged membership rolls back both new records while the original inbox fact survives.
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.admission_notification_preferences set mode='grouped',version=version+1 where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.leaderId}`));
      const currentScope = await createSource();
      let stagedMemberObserved = false;
      await expect(database.withContext(fixture.own, (transaction) => new PostgresAdmissionNotificationRepository(transaction, async (current, tribeId) => {
        const allowed = await authorize(current, tribeId);
        stagedMemberObserved = Boolean((await current.execute(sql`select obligation_id from public.admission_notification_group_members where obligation_id=${currentScope.obligationId} and recipient_user_id=${fixture.leaderId}`)).rows[0]);
        return allowed && !stagedMemberObserved;
      }, async () => keys.config).collect(currentScope))).rejects.toMatchObject({ code: "permission_denied" });
      expect(stagedMemberObserved).toBe(true);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.admission_notification_groups where tribe_id=${fixture.tribeId}) as groups,(select count(*)::int from public.admission_notification_group_members where tribe_id=${fixture.tribeId}) as members,(select count(*)::int from public.notifications where admission_obligation_id=${currentScope.obligationId}) as notices`)).rows[0])).toEqual({ groups: 1, members: 1, notices: 2 });

      // Current native recipient role, tested capability, trust and enablement independently close subsequent new collection.
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='tribemate' where tribe_id=${fixture.tribeId} and user_id=${fixture.guardianId}`));
      expect(await collect({ ...currentScope, recipientUserId: fixture.guardianId })).toEqual({ status: "suppressed", reason: "recipient_not_authorized" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_connection_capabilities set state='unavailable' where connection_id=${connectionId} and channel='email'`));
      expect(await collect(currentScope)).toEqual({ status: "suppressed", reason: "email_capability_unavailable" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_connection_capabilities set state='prepared' where connection_id=${connectionId} and channel='email'`));
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.global_identity_evidence set invalidated_at=clock_timestamp(),invalidation_reason='synthetic_identity_retirement' where user_id=${fixture.leaderId} and invalidated_at is null`));
      expect(await collect(currentScope)).toEqual({ status: "suppressed", reason: "account_email_untrusted" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.admission_email_settings set enabled=false,version=version+1 where tribe_id=${fixture.tribeId}`));
      expect(await collect(currentScope)).toEqual({ status: "suppressed", reason: "email_disabled" });
    }, { concurrentTransactions: 2 });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
