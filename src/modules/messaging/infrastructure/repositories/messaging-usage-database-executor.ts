/** Current-principal checkout and original ledger row shared by the messaging usage and operation readers. @module messaging-usage-database-executor */
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingUsageContext } from "../../domain/repositories/messaging-usage-operations";

/** Binds all checkouts to the same current server principal, never body-selected identity. */
export type MessagingUsageDatabaseExecutor = <Result>(context: MessagingUsageContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/** Consumed original ledger metadata of one actor/tribe operation; the stored public_result is guarded as its own DTO by application. */
export type MessagingOperationLedgerRow = { operation_type: string; state: string; idempotency_key: string; public_result: unknown };
