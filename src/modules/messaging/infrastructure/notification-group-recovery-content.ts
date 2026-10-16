/** Defines the same-transaction content-owner seam without granting durable dispatch authority. @module notification-group-recovery-content */
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Contains server-selected original lineage and the currently locked tested target. */
export type NotificationGroupRecoveryContentCommand = {
  readonly tribeId: string;
  readonly originalDeliveryId: string;
  readonly recoveryDeliveryId: string;
  readonly connectionId: string;
  readonly connectionVersion: number;
  readonly contributingLeaderUserId: string;
  readonly senderId: string;
  readonly idempotencyKey: string;
  readonly queuedUsagePolicyVersion: number;
};

/** Keeps complete authenticated content private and its native lifetime exact through the owning writer. */
export type PreparedNotificationGroupRecoveryContent = {
  readonly groupId: string;
  readonly audience: "applicant" | "reviewer";
  readonly createdAtMicroseconds: number;
  readonly deadlineAtMicroseconds: number;
  readonly frozenIntent: unknown;
  readonly keyId: string;
  readonly mac: Uint8Array;
};

/** Repeats the original human session/leadership/recency inside the caller's existing transaction. */
export type NotificationGroupRecoveryAuthorizer = (database: RequestDatabase, tribeId: string) => Promise<boolean>;

/** Separates notifications' complete source/content policy from messaging's atomic ledger and transport lineage. */
export interface NotificationGroupRecoveryContent {
  /** @param database - Existing authorized ledger transaction. @param command - Exact original and current tested replacement. @param authorize - Current native authority, never a browser assertion. @returns Complete content authenticated and rebound without reserving or dispatching. */
  prepare(database: RequestDatabase, command: NotificationGroupRecoveryContentCommand, authorize: NotificationGroupRecoveryAuthorizer): Promise<PreparedNotificationGroupRecoveryContent>;
  /** @param database - Current original transaction, including the ledger's final fence. @param command - Original fixed replacement intent. @param prepared - Complete newly signed content. @param authorize - Current native authority after waits. @returns After every current source, identity, key and lifetime is checked again. */
  assertCurrent(database: RequestDatabase, command: NotificationGroupRecoveryContentCommand, prepared: PreparedNotificationGroupRecoveryContent, authorize: NotificationGroupRecoveryAuthorizer): Promise<void>;
}
