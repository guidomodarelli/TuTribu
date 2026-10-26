/** Defines owned notification metadata for explicit recovery, without recipient or private intent. @module notification-delivery-catalog-result */
/** Tracks an observed delivery version independently of its original connection version. */
export type NotificationDeliveryCatalogItem = {
  id: string;
  version: number;
  state: "queued" | "accepted" | "delivered" | "failed" | "unknown" | "suppressed" | "cancelled";
  connectionId: string;
  createdAt: string;
  deadlineAt: string;
  recoveryDeliveryId: string | null;
};
/** A stable chronological cursor grants no tenant or actor authority. */
export type NotificationDeliveryCatalogCursor = { deliveryId: string; createdAt: string };
/** Keeps pagination explicit so earlier notices remain reachable. */
export type NotificationDeliveryCatalogResult = { items: NotificationDeliveryCatalogItem[]; nextCursor: NotificationDeliveryCatalogCursor | null };
