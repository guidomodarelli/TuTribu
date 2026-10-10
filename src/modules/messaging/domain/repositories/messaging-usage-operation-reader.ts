/** Defines read-only original usage recovery without a lease, keyring, connection or writer. @module messaging-usage-operation-reader */
import type { MessagingUsageContext } from "./messaging-usage-operations";
export interface MessagingUsageOperationReader {
  read(context: MessagingUsageContext, operationId: string): Promise<unknown | null>;
}
