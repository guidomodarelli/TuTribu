/** Defines local lifecycle authority independently of operational credentials or provider availability. @module messaging-connection-lifecycle */
import type { MessagingUsageContext } from "./messaging-usage-operations";
import type { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

/** Only these connection-scoped local actions can use lifecycle management authority. */
export type MessagingConnectionLifecycleOperation = typeof REAUTHENTICATION_OPERATION.suspendMessagingConnection | typeof REAUTHENTICATION_OPERATION.disconnectMessagingConnection;
/** Contains server-derived identity and exact global recency, with no credential or provider scope. */
export type MessagingConnectionLifecycleContext = MessagingUsageContext & {
  connectionId: string; resourceId: string; operation: MessagingConnectionLifecycleOperation;
  accountId: string; subject: string; authenticatedAt: Date; validUntil: Date;
};
