/** Reads only actor/tribe usage namespaces under current SQL leadership and session guards. @module postgres-messaging-usage-operation-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingUsageContext } from "../../domain/repositories/messaging-usage-operations";
import type { MessagingUsageOperationReader } from "../../domain/repositories/messaging-usage-operation-reader";
import { authorizeMessagingUsage } from "./postgres-messaging-usage-authorizer";
import { MessagingUsageOperationError } from "../../domain/errors/messaging-usage-operation-error";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGING_USAGE_RECOVERABLE_OPERATION } from "../../constants/messaging-usage";
import { OPERATION_STATE } from "@/src/constants/operation-state";

/** Consumed registry fields; database rows remain owned by SQL rather than schema-revalidated. */
type UsageOperationRow = { operation_type: string; state: string; idempotency_key: string; public_result: unknown };
/** No crypto, SDK, lease, claim or mutation capability is present. */
export class PostgresMessagingUsageOperationReader implements MessagingUsageOperationReader {
  /** @param execute - Actual current account executor with the shared guarded checkout. */
  constructor(private readonly execute: <Result>(context: MessagingUsageContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>) {}
  /** @param context - Server-owned current principal and tribe. @param operationId - Original client UUID. @returns Original state or real absence; ambiguous namespaces close without releasing work. */
  async read(context: MessagingUsageContext, operationId: string): Promise<unknown | null> {
    return this.execute(context, async (database) => {
      await authorizeMessagingUsage(database, context);
      const rows = (await database.execute<UsageOperationRow>(sql`select operation_type,state,idempotency_key,public_result from public.academy_admission_operations where actor_user_id=${context.actorUserId} and tribe_id=${context.tribeId} and idempotency_key=${operationId} and operation_type=any(${sql.param(Object.values(MESSAGING_USAGE_RECOVERABLE_OPERATION))}::text[]) limit 2`)).rows;
      await authorizeMessagingUsage(database, context);
      if (rows.length > 1) throw new MessagingUsageOperationError(MESSAGING_ERROR_CODE.idempotencyConflict);
      const row = rows[0];
      if (!row) return null;
      return row.state === OPERATION_STATE.completed ? { type: row.operation_type, state: row.state, operationId: row.idempotency_key, replayed: true, result: row.public_result }
        : { type: row.operation_type, state: row.state, operationId: row.idempotency_key };
    });
  }
}
