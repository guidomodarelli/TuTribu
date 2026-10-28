/** Owns bounded notification catalog contracts and stable chronological pagination. @module notification-delivery-catalog */
import { z } from "zod";
import type { NotificationDeliveryCatalogResult } from "../application/results/notification-delivery-catalog-result";
import { MESSAGE_DELIVERY_STATE } from "./message-delivery";
import { MESSAGING_ERROR_CODE, MESSAGING_ERROR_MESSAGE } from "./messaging-errors";

/** Limits one owned leader projection without hiding earlier notices behind an unbounded query. */
export const NOTIFICATION_DELIVERY_CATALOG_PAGE_SIZE = 50;
/** Names the readonly own route; no provider or arbitrary recipient identifier can be supplied. */
export const NOTIFICATION_DELIVERY_CATALOG_HTTP = { path: "messaging/notification-deliveries", operation: "read_notification_delivery_catalog" } as const;
/** Cursor identity is public input, never a permissions token. */
export const notificationDeliveryCatalogCursorSchema = z.strictObject({ deliveryId: z.uuid(), createdAt: z.iso.datetime({ offset: true }) });
/** The boundary rejects partial cursors and browser authority flags before composing services. */
export const notificationDeliveryCatalogQuerySchema = z.strictObject({ cursorId: z.uuid().optional(), cursorCreatedAt: z.iso.datetime({ offset: true }).optional() }).refine((query) => Boolean(query.cursorId) === Boolean(query.cursorCreatedAt));
/** Guards only own projection fields and coherent lineage/pagination, never database rows. */
export const notificationDeliveryCatalogSchema: z.ZodType<NotificationDeliveryCatalogResult> = z.strictObject({
  items: z.array(z.strictObject({ id: z.uuid(), version: z.int().positive(), state: z.enum(MESSAGE_DELIVERY_STATE), connectionId: z.uuid(), createdAt: z.iso.datetime({ offset: true }), deadlineAt: z.iso.datetime({ offset: true }), recoveryDeliveryId: z.uuid().nullable() }).refine((item) => item.recoveryDeliveryId?.toLowerCase() !== item.id.toLowerCase())).max(NOTIFICATION_DELIVERY_CATALOG_PAGE_SIZE),
  nextCursor: notificationDeliveryCatalogCursorSchema.nullable(),
}).refine((catalog) => {
  const last = catalog.items.at(-1);
  return catalog.nextCursor === null || (catalog.nextCursor.deliveryId.toLowerCase() === last?.id.toLowerCase() && catalog.nextCursor.createdAt === last.createdAt);
});
/** Initial own server state preserves recoverable catalog failure without leaking its private cause. */
export const notificationDeliveryCatalogPageSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ready"), value: notificationDeliveryCatalogSchema }),
  z.strictObject({ status: z.literal("failed"), code: z.enum(MESSAGING_ERROR_CODE), message: z.string() }).refine((failure) => failure.message === MESSAGING_ERROR_MESSAGE[failure.code]),
]);
