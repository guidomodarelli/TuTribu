/** @vitest-environment node */
/** Exercises explicit group delivery provenance, scoped integrity, private RLS, rollback and retirement on real PostgreSQL. @module notification-group-delivery-origins-tests */
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationGroupDelivery } from "@/tests/support/admission-notification-group-delivery-fixture";
import { prepareNotificationDeliveryRecovery } from "@/tests/support/notification-delivery-recovery-fixture";
import { createAdmissionRequestSnapshotFixture } from "@/tests/support/admission-request-snapshot-fixture";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import * as databaseSchema from "@/src/modules/shared/infrastructure/database/schema";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native grouped notification delivery origins", () => {
  it("should preserve explicit group identity through scoped rollback and retirement without interpreting its first obligation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given a genuine frozen group with its original exact native deadline, and an independent legacy obligation delivery.
      const fixture = await prepareAdmissionNotificationGroupDelivery(database);
      const legacyId = await database.withContext(fixture.own, (transaction) => fixture.insert(transaction, { groupId: null }));
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select notification_group_id,notification_group_audience from public.message_deliveries where id=${legacyId}`)).rows[0])).toEqual({ notification_group_id: null, notification_group_audience: null });
      let stagedOriginObserved = false;

      // When the owner observes its staged origin and then aborts, both new records roll back together.
      await expect(database.withContext(fixture.own, async (transaction) => {
        await fixture.insert(transaction);
        stagedOriginObserved = Boolean((await transaction.execute(sql`select group_id from public.messaging_notification_group_origins where group_id=${fixture.groupId}`)).rows[0]);
        expect(stagedOriginObserved).toBe(true);
        throw new Error("Synthetic notification group origin owner abort");
      })).rejects.toThrow("Synthetic notification group origin owner abort");
      expect(stagedOriginObserved).toBe(true);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as count from public.messaging_notification_group_origins where tribe_id=${fixture.tribeId}`)).rows[0].count)).toBe(0);

      const deliveryId = await database.withContext(fixture.own, (transaction) => fixture.insert(transaction));
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.select({ groupId: databaseSchema.messageDeliveries.notificationGroupId, audience: databaseSchema.messageDeliveries.notificationGroupAudience, source: databaseSchema.messageDeliveries.sourceResourceId }).from(databaseSchema.messageDeliveries).where(eq(databaseSchema.messageDeliveries.id, deliveryId)))[0])).toEqual({ groupId: fixture.groupId, audience: "reviewer", source: fixture.groupId });
      expect(fixture.groupId).not.toBe(fixture.obligationIds[1]);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.select().from(databaseSchema.messagingNotificationGroupOrigins).where(eq(databaseSchema.messagingNotificationGroupOrigins.tribeId, fixture.tribeId)))[0])).toEqual({ groupId: fixture.groupId, tribeId: fixture.tribeId, recipientRef: fixture.leaderId, audience: "reviewer" });
      // A real obligation may share another resource's UUID; the explicit group fields keep their delivery namespaces independent.
      const collidingRequestId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        const snapshot = createAdmissionRequestSnapshotFixture({ id: collidingRequestId, tribeId: fixture.tribeId, userId: fixture.applicantIds[2], submittedAt: new Date() });
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,original_policy_snapshot,expires_at) values (${collidingRequestId},${fixture.tribeId},${fixture.applicantIds[2]},'common',${JSON.stringify(snapshot)}::jsonb,clock_timestamp()+interval '30 days')`);
        await transaction.execute(sql`select public.create_admission_notification_obligation(${fixture.groupId},${fixture.tribeId},${collidingRequestId},${fixture.applicantIds[2]},'pending_created')`);
        await transaction.execute(sql`select public.enqueue_admission_notification(${fixture.groupId},${fixture.leaderId},'reviewer')`);
        await fixture.insert(transaction, { groupId: null, sourceId: fixture.groupId });
        expect((await transaction.execute(sql`select count(*)::int as count from public.message_deliveries where tribe_id=${fixture.tribeId} and purpose='admission_notification'`)).rows[0].count).toBe(3);
      });
      for (const input of [{ groupId: randomUUID() }, { recipientRef: fixture.otherLeaderId }, { audience: "applicant" }]) await expect(database.withContext(fixture.own, (transaction) => fixture.insert(transaction, input))).rejects.toMatchObject({ cause: { code: "23503" } });
      for (const input of [{ sourceId: fixture.obligationIds[1] }, { purpose: "admission" }, { audience: null }, { deadlineOffsetMicroseconds: 1 }]) await expect(database.withContext(fixture.own, (transaction) => fixture.insert(transaction, input))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.message_deliveries set notification_group_id=null,notification_group_audience=null where id=${deliveryId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_notification_group_origins set recipient_ref=${fixture.otherLeaderId} where group_id=${fixture.groupId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await database.grantTablesToNonBypass(["messaging_notification_group_origins"]);
      expect(await database.withContext(fixture.own, (transaction) => transaction.select().from(databaseSchema.messagingNotificationGroupOrigins).where(eq(databaseSchema.messagingNotificationGroupOrigins.tribeId, fixture.tribeId)), "non_bypass")).toEqual([]);
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.messaging_notification_group_origins(group_id,tribe_id,recipient_ref,audience) values (${randomUUID()},${fixture.tribeId},${fixture.leaderId},'reviewer')`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });

      // Then physical tribe retirement removes live groups but retains only opaque provenance for retained deliveries.
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.tribes where id=${fixture.tribeId}`));
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as count from public.admission_notification_groups where id=${fixture.groupId}`)).rows[0].count)).toBe(0);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select notification_group_id,notification_group_audience,source_resource_id,state from public.message_deliveries where id=${deliveryId}`)).rows[0])).toEqual({ notification_group_id: fixture.groupId, notification_group_audience: "reviewer", source_resource_id: fixture.groupId, state: "cancelled" });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as count from public.messaging_notification_group_origins where group_id=${fixture.groupId}`)).rows[0].count)).toBe(1);
      await expect(database.withContext(fixture.own, (transaction) => fixture.insert(transaction))).rejects.toMatchObject({ cause: { code: "42501" } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.message_deliveries where id=${deliveryId}`));
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as count from public.messaging_notification_group_origins where group_id=${fixture.groupId}`)).rows[0].count)).toBe(0);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should preserve actual legacy recovery with null group fields and its original transport lineage", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotificationDeliveryRecovery(database);
      const result = await fixture.repository.recover(fixture.context, fixture.input);
      expect(result.state).toBe("completed");
      if (result.state !== "completed") throw new Error("Legacy notification recovery did not confirm its original complete result");
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select notification_group_id,notification_group_audience,recovery_of_delivery_id,source_resource_id from public.message_deliveries where id=${result.result.recoveryDeliveryId}`)).rows[0])).toEqual({ notification_group_id: null, notification_group_audience: null, recovery_of_delivery_id: fixture.context.deliveryId, source_resource_id: fixture.obligationId });
      expect(await fixture.repository.recover(fixture.context, fixture.input)).toEqual({ ...result, replayed: true });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as count from public.messaging_notification_group_origins where tribe_id=${fixture.context.tribeId}`)).rows[0].count)).toBe(0);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
