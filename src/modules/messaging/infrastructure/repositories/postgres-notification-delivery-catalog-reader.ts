/** Projects only current own notification metadata while native session/leader locks remain held. @module postgres-notification-delivery-catalog-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { NotificationDeliveryCatalogReader, NotificationDeliveryCatalogPosition } from "../../domain/repositories/notification-delivery-catalog-reader";
import type { MessagingUsageContext } from "../../domain/repositories/messaging-usage-operations";
import type { NotificationDeliveryCatalogItem } from "../../application/results/notification-delivery-catalog-result";
import { NOTIFICATION_DELIVERY_CATALOG_PAGE_SIZE } from "../../constants/notification-delivery-catalog";
import { NOTIFICATION_DELIVERY_RECOVERY_PURPOSE } from "../../constants/notification-delivery-recovery";
import { NOTIFICATION_DELIVERY_CATALOG_TIMESTAMP_FORMAT } from "../../constants/notification-delivery-catalog-database";
import { authorizeMessagingTribeManagement } from "./postgres-messaging-usage-authorizer";

/** Consumes selected Postgres fields by their adapter contract without schema-validating backend rows. */
type CatalogRow = { id: string; version: number; state: NotificationDeliveryCatalogItem["state"]; connection_id: string; created_at: string; deadline_at: Date | string; recovery_delivery_id: string | null };
/** Reads a stable bounded page; the owning tribe fence also serializes recovery lineage writes. */
export class PostgresNotificationDeliveryCatalogReader implements NotificationDeliveryCatalogReader {
  /** @param execute - Existing original actor's protected native executor. */
  constructor(private readonly execute: <Result>(context: MessagingUsageContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>) {}
  /** @param context - Current own native actor/session/tribe. @param cursor - Previous own page position or latest. @returns Public projection only, without creating jobs or consulting an external provider. */
  async read(context: MessagingUsageContext, cursor: NotificationDeliveryCatalogPosition | null) {
    return this.execute(context, async (database) => {
      await authorizeMessagingTribeManagement(database, context);
      const position = cursor ? sql`and (delivery.created_at,delivery.id)<(${cursor.createdAt}::timestamptz,${cursor.deliveryId}::uuid)` : sql``;
      const rows = (await database.execute<CatalogRow>(sql`select delivery.id,delivery.version,delivery.state,delivery.connection_id,to_char(delivery.created_at at time zone 'UTC',${NOTIFICATION_DELIVERY_CATALOG_TIMESTAMP_FORMAT}) as created_at,delivery.deadline_at,(select child.id from public.message_deliveries child where child.tribe_id=delivery.tribe_id and child.recovery_of_delivery_id=delivery.id) as recovery_delivery_id from public.message_deliveries delivery where delivery.tribe_id=${context.tribeId} and delivery.purpose=${NOTIFICATION_DELIVERY_RECOVERY_PURPOSE} ${position} order by delivery.created_at desc,delivery.id desc limit ${NOTIFICATION_DELIVERY_CATALOG_PAGE_SIZE + 1} for share of delivery`)).rows;
      await authorizeMessagingTribeManagement(database, context);
      const items = rows.slice(0, NOTIFICATION_DELIVERY_CATALOG_PAGE_SIZE).map((row) => ({ id: row.id, version: row.version, state: row.state, connectionId: row.connection_id, createdAt: row.created_at, deadlineAt: new Date(row.deadline_at).toISOString(), recoveryDeliveryId: row.recovery_delivery_id }));
      const last = items.at(-1);
      return { items, nextCursor: rows.length > NOTIFICATION_DELIVERY_CATALOG_PAGE_SIZE && last ? { deliveryId: last.id, createdAt: last.createdAt } : null };
    });
  }
}
