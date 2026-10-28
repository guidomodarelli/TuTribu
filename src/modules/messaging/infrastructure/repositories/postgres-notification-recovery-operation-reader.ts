/** Reads original recovery state without keyrings, provider RPC, new leases or writes. @module postgres-notification-recovery-operation-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { NotificationRecoveryOperationReader } from "../../domain/repositories/notification-recovery-operation-reader";
import type { MessagingUsageContext } from "../../domain/repositories/messaging-usage-operations";
import { MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/message-delivery-reauthentication";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { authorizeMessagingTribeManagement } from "./postgres-messaging-usage-authorizer";

/** Stored public_result is guarded as an owned DTO by application; private PostgreSQL rows are not schema-validated. */
type RecoveryOperationRow = { state: string; idempotency_key: string; public_result: unknown };

/** Limits the lookup to this exact actor, tribe and recovery namespace while retaining current role/session locks. */
export class PostgresNotificationRecoveryOperationReader implements NotificationRecoveryOperationReader {
  /** @param execute - Existing current actor's guarded native read executor. */
  constructor(private readonly execute: <Result>(context: MessagingUsageContext, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>) {}

  /** @param context - Server-derived current actor/session/tribe. @param operationId - Original caller UUID. @returns Only the original public state or absence, never private intent, key, lease or provider metadata. */
  async read(context: MessagingUsageContext, operationId: string): Promise<unknown> {
    return this.execute(context, async (database) => {
      await authorizeMessagingTribeManagement(database, context);
      const row = (await database.execute<RecoveryOperationRow>(sql`select state,idempotency_key,public_result from public.academy_admission_operations where actor_user_id=${context.actorUserId} and tribe_id=${context.tribeId} and operation_type=${MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification} and idempotency_key=${operationId}`)).rows[0];
      await authorizeMessagingTribeManagement(database, context);
      return row ? { type: MESSAGE_DELIVERY_REAUTHENTICATION_OPERATION.recoverNotification, state: row.state, operationId: row.idempotency_key, replayed: true, ...(row.state === OPERATION_STATE.completed ? { result: row.public_result } : {}) } : null;
    });
  }
}
