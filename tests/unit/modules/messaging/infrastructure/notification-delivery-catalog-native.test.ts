/** @vitest-environment node */
/** Exercises protected native notification reads, current authority and lineage without new sends. @module notification-delivery-catalog-native-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareNotificationDeliveryRecovery } from "@/tests/support/notification-delivery-recovery-fixture";
import { PostgresNotificationDeliveryCatalogReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-notification-delivery-catalog-reader";
import { notificationDeliveryCatalogSchema } from "@/src/modules/messaging/constants/notification-delivery-catalog";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingUsageContext } from "@/src/modules/messaging/domain/repositories/messaging-usage-operations";

describe.runIf(process.env.RUN_ADMISSION_SQL_TESTS === "1")("native notification catalog", () => {
  it("should scope current own facts and lineage without provider calls or additional usage", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotificationDeliveryRecovery(database);
      const reader = new PostgresNotificationDeliveryCatalogReader(<Result>(_context: MessagingUsageContext, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(fixture.own, run));
      const context: MessagingUsageContext = { actorUserId: fixture.context.actorUserId, sessionId: fixture.context.sessionId, tribeId: fixture.context.tribeId, requestId: randomUUID() };
      const sendsBefore = fixture.transport.receipts.length;
      const before = notificationDeliveryCatalogSchema.parse(await reader.read(context, null));
      expect(before.items).toHaveLength(1);
      expect(before.items.find((item) => item.id === fixture.context.deliveryId)).toMatchObject({ version: 1, state: "suppressed", connectionId: fixture.originalConnectionId, recoveryDeliveryId: null });
      const result = await fixture.recovery.execute({ tribeId: fixture.context.tribeId, deliveryId: fixture.context.deliveryId, requestId: randomUUID(), ...fixture.input });
      expect(result.ok).toBe(true);
      if (!result.ok || result.value.state !== "completed") throw new Error("Synthetic catalog recovery did not complete");
      const recovery = result.value.result;
      const after = notificationDeliveryCatalogSchema.parse(await reader.read(context, null));
      expect(after.items).toHaveLength(2);
      expect(after.items.find((item) => item.id === fixture.context.deliveryId)).toMatchObject({ version: 2, recoveryDeliveryId: recovery.recoveryDeliveryId });
      expect(after.items.find((item) => item.id === recovery.recoveryDeliveryId)).toMatchObject({ state: "queued", connectionId: fixture.input.targetConnectionId });
      expect(after.items.every((item) => Object.keys(item).sort().join(",") === "connectionId,createdAt,deadlineAt,id,recoveryDeliveryId,state,version")).toBe(true);
      const first = after.items[0]!;
      const metadata = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ valid_index: boolean; sub_millisecond: number }>(sql`select exists(select 1 from pg_index index_metadata join pg_class index_relation on index_relation.oid=index_metadata.indexrelid where index_relation.relname='idx_notification_delivery_catalog' and index_metadata.indisvalid and index_metadata.indisready) as valid_index,(extract(microseconds from created_at)::int % 1000) as sub_millisecond from public.message_deliveries where id=${first.id}`)).rows[0]!);
      expect(metadata.valid_index).toBe(true);
      expect(Number(first.createdAt.split(".")[1]!.replace("Z", "").slice(3))).toBe(metadata.sub_millisecond);
      expect(notificationDeliveryCatalogSchema.parse(await reader.read(context, { deliveryId: first.id, createdAt: first.createdAt })).items).toEqual(after.items.slice(1));
      await expect(reader.read({ ...context, tribeId: randomUUID() }, null)).rejects.toMatchObject({ code: "permission_denied" });
      await expect(reader.read({ ...context, sessionId: randomUUID() }, null)).rejects.toMatchObject({ code: "authentication_required" });
      expect(fixture.transport.receipts).toHaveLength(sendsBefore);
      const usage = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ reservations: number; attempts: number }>(sql`select (select count(*)::int from public.messaging_usage_reservations where tribe_id=${fixture.context.tribeId}) as reservations,(select count(*)::int from public.message_delivery_attempts where tribe_id=${fixture.context.tribeId}) as attempts`)).rows[0]);
      expect(usage).toEqual(fixture.baselineUsage);
    });
  }, 900_000);
});
