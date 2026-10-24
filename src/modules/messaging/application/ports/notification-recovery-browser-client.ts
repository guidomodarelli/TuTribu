/** Defines explicit notification recovery observations without UI state, retries or external DTOs. @module notification-recovery-browser-client */
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { NotificationRecoveryCommand } from "../commands/notification-recovery-command";
import type { NotificationDeliveryRecoveryResult } from "../results/notification-delivery-recovery-result";
import type { NotificationRecoveryOperationResult } from "../results/notification-recovery-operation-result";
import type { MessagingUsageBrowserResult } from "./messaging-usage-browser-client";
import type { NotificationDeliveryCatalogCursor, NotificationDeliveryCatalogResult } from "../results/notification-delivery-catalog-result";

/** Route identity grants no actor, sensitive scope or sending authority. */
export type NotificationRecoveryBrowserScope = { slug: string; deliveryId: string };

/** Each mutation requires a preserved original intent and renewed explicit confirmation. */
export interface NotificationRecoveryBrowserClient {
  /** @param query - Exact owning tribe and previous chronological position. @param signal - Read observation lifetime. @returns Bounded own notification metadata without provider queries or another send. */
  catalog(query: { slug: string; cursor: NotificationDeliveryCatalogCursor | null }, signal: AbortSignal): Promise<MessagingUsageBrowserResult<NotificationDeliveryCatalogResult>>;
  /** @param scope - Exact original public delivery. @param input - Explicit original replacement intent. @param signal - Observation lifetime. @returns Minimum registered progress or original lineage, without retry or dispatch. */
  recover(scope: NotificationRecoveryBrowserScope, input: NotificationRecoveryCommand, signal: AbortSignal): Promise<MessagingUsageBrowserResult<AdmissionOperationResult<NotificationDeliveryRecoveryResult>>>;
  /** @param query - Exact original UUID within its owning tribe. @param signal - Read lifetime. @returns Historical own result or safe absence/current denial, with no mutation. */
  operation(query: { slug: string; operationId: string }, signal: AbortSignal): Promise<MessagingUsageBrowserResult<NotificationRecoveryOperationResult>>;
}
