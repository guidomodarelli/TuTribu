/** Reads only an actor's original notification recovery result without retry or credential capabilities. @module notification-recovery-operation-reader */
import type { MessagingUsageContext } from "./messaging-usage-operations";

/** Own readonly storage port cannot claim leases, dispatch or select an arbitrary ledger namespace. */
export interface NotificationRecoveryOperationReader {
  /** @param context - Current native actor/session and exact tribe. @param operationId - Original caller UUID. @returns Registered original state, guarded later as the own public DTO, or real absence. */
  read(context: MessagingUsageContext, operationId: string): Promise<unknown>;
}
