/** Defines the explicit public recovery intent without account, readiness or provider authority. @module notification-recovery-command */
import type { NotificationDeliveryRecoveryInput } from "../../domain/repositories/notification-delivery-recovery";

/** Preserves the original UUID/CAS and the single supported replacement cause. */
export type NotificationRecoveryCommand = NotificationDeliveryRecoveryInput & {
  reason: "authorized_connection_replacement";
};
