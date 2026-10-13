/** Describes only an owned historical recovery result or genuinely registered progress. @module notification-recovery-operation-result */
import type { NotificationDeliveryRecoveryResult } from "./notification-delivery-recovery-result";

/** Keeps the original namespace explicit while excluding private intent, leases and recipient data. */
export type NotificationRecoveryOperationResult = {
  type: "recover_notification_delivery";
  operationId: string;
  replayed: true;
} & ({ state: "started" } | { state: "completed"; result: NotificationDeliveryRecoveryResult });
