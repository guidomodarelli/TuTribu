/** Defines an owned leader catalog read without key, claim or dispatch capabilities. @module notification-delivery-catalog-reader */
import type { MessagingUsageContext } from "./messaging-usage-operations";
/** Pure cursor metadata is independent from HTTP and native persistence details. */
export type NotificationDeliveryCatalogPosition = { deliveryId: string; createdAt: string };
/** Current authority and projection guarding remain separate boundaries. */
export interface NotificationDeliveryCatalogReader {
  /** @param context - Server-derived current actor/session/tribe. @param cursor - Stable position or the latest first page. @returns Own public projection to guard, without recipient, key, provider or intent data. */
  read(context: MessagingUsageContext, cursor: NotificationDeliveryCatalogPosition | null): Promise<unknown>;
}
