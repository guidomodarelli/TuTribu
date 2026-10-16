/** @vitest-environment node */
/** Exercises full group recovery through actual PostgreSQL, complete content and atomic lineage without a provider call. @module admission-notification-group-recovery-tests */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationGroupRecovery } from "@/tests/support/admission-notification-group-recovery-fixture";
import { ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { PostgresAdmissionNotificationDeliveryAuthority } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-delivery-authority";
import { PostgresNotificationDeliveryRecoveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-notification-delivery-recovery-repository";
import type { AdmissionNotificationGroupManifest } from "@/src/modules/notifications/domain/entities/admission-notification";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native complete notification group recovery", () => {
  it("should preserve complete content, exact deadline and provenance in one committed child and return its original replay without attempts or reservations", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupRecovery(database, true);
      const readOriginal = () => fixture.execute(async (transaction) => (await transaction.execute<{ frozen_intent: { manifest: AdmissionNotificationGroupManifest; subject: string; text: string; href: string }; deadline: string }>(sql`select frozen_intent,deadline_at::text as deadline from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows[0]);
      const before = await readOriginal();
      expect(before.frozen_intent.manifest.items).toHaveLength(2);
      const outcome = await fixture.recovery.execute({ ...fixture.input, tribeId: fixture.tribeId, deliveryId: fixture.original.deliveryId, requestId: fixture.context.requestId });
      if (!outcome.ok) throw outcome.failure.cause ?? new Error(`Complete group recovery failed: ${outcome.failure.code}`);
      const result = outcome.value;
      expect(result.state).toBe("completed");
      if (result.state !== "completed") throw new Error("Complete group recovery did not return its committed original result");
      expect(await fixture.repository.recover(fixture.context, fixture.input)).toEqual({ ...result, replayed: true });
      const after = await fixture.execute(async (transaction) => ({
        children: (await transaction.execute<{ id: string; state: string; notification_group_id: string; notification_group_audience: string; source_resource_id: string; recovery_of_delivery_id: string; frozen_intent: { format: number; manifest: unknown; senderId: string; subject: string; text: string; href: string }; deadline: string }>(sql`select id,state,notification_group_id,notification_group_audience,source_resource_id,recovery_of_delivery_id,frozen_intent,deadline_at::text as deadline from public.message_deliveries where recovery_of_delivery_id=${fixture.original.deliveryId}`)).rows,
        original: (await transaction.execute(sql`select state,version from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows[0],
        effects: (await transaction.execute(sql`select (select count(*)::int from public.message_delivery_attempts where tribe_id=${fixture.tribeId}) as attempts,(select count(*)::int from public.messaging_usage_reservations where tribe_id=${fixture.tribeId}) as reservations,(select count(*)::int from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and event_type='notification_delivery_recovered') as audits,(select count(*)::int from public.academy_admission_operations where tribe_id=${fixture.tribeId} and operation_type='recover_notification_delivery' and state='completed') as completed_operations,(select bool_and(audit.created_at=delivery.created_at) from public.academy_admission_audit_events audit join public.message_deliveries delivery on delivery.id=audit.resource_id where delivery.recovery_of_delivery_id=${fixture.original.deliveryId} and audit.event_type='notification_delivery_recovered') as exact_owner_clock`)).rows[0],
      }));
      expect(await readOriginal()).toEqual(before);
      expect(after.original).toEqual({ state: "cancelled", version: 2 });
      expect(after.children).toHaveLength(1);
      expect(after.children[0]).toMatchObject({ id: result.result.recoveryDeliveryId, state: "queued", notification_group_id: fixture.original.groupId, notification_group_audience: "reviewer", source_resource_id: fixture.original.groupId, recovery_of_delivery_id: fixture.original.deliveryId, deadline: before.deadline, frozen_intent: { format: 2, manifest: before.frozen_intent.manifest, senderId: fixture.senderId, subject: before.frozen_intent.subject, text: before.frozen_intent.text, href: before.frozen_intent.href } });
      expect(after.effects).toEqual({ attempts: 0, reservations: 0, audits: 1, completed_operations: 1, exact_owner_clock: true });
      const current = await fixture.execute((transaction) => new PostgresAdmissionNotificationDeliveryAuthority(transaction, fixture.authorize, fixture.readSecurityConfig).read({ tribeId: fixture.tribeId, deliveryId: result.result.recoveryDeliveryId }));
      expect(current.status).toBe("current");
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);

  it("should close incomplete group composition instead of treating a group reference as an individual obligation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupRecovery(database);
      await expect(new PostgresNotificationDeliveryRecoveryRepository(fixture.executeActor, fixture.readSecurityConfig).recover(fixture.context, fixture.input)).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(await fixture.execute(async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where recovery_of_delivery_id=${fixture.original.deliveryId}) as children,(select version from public.message_deliveries where id=${fixture.original.deliveryId}) as original_version`)).rows[0])).toEqual({ children: 0, original_version: 1 });
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);
});
