import "server-only";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, PoolClient } from "pg";

import { createPostgresPool } from "./postgres-pool";
import { getServerDatabaseEnvironment } from "./server-environment";

const DATABASE_CONTEXT_SETTING = {
  currentUserEmail: "app.current_user_email",
  currentUserId: "app.current_user_id",
  mercadoPagoWebhookVerified: "app.mercado_pago_webhook_verified",
} as const;
const DATABASE_TRANSACTION = {
  begin: "BEGIN",
  commit: "COMMIT",
  emptySettingValue: "",
  rollback: "ROLLBACK",
  verifiedSettingValue: "true",
} as const;

const DATABASE_TRANSACTION_SETTING = {
  idleInTransactionSessionTimeout: "idle_in_transaction_session_timeout",
} as const;

/**
 * Server-side guard that terminates a transaction abandoned before commit so the
 * pooled connection is reclaimed instead of leaking. Renders aborted mid-flight
 * (for example by the dev render restarts or by a client disconnect) suspend the
 * `finally` release indefinitely, which otherwise exhausts the pool. The window
 * is far larger than any legitimate request transaction, so healthy work is
 * never affected.
 */
const IDLE_IN_TRANSACTION_TIMEOUT_MILLISECONDS = 30000;

const DATABASE_POOL_OPERATION = {
  idleError: "runtime_database_pool_idle_error",
} as const;

type GlobalDatabase = typeof globalThis & {
  __tuTribuDatabasePool?: Pool;
};

export type RequestDatabaseContext = {
  email: string | null;
  mercadoPagoWebhookVerified?: boolean;
  userId: string | null;
};

function createRequestDatabase(client: PoolClient) {
  return drizzle(client);
}

export type RequestDatabase = ReturnType<typeof createRequestDatabase>;

function getDatabasePool() {
  const globalDatabase = globalThis as GlobalDatabase;

  if (!globalDatabase.__tuTribuDatabasePool) {
    const { connectionString } = getServerDatabaseEnvironment();
    globalDatabase.__tuTribuDatabasePool = createPostgresPool({
      connectionString,
      operation: DATABASE_POOL_OPERATION.idleError,
    });
  }

  return globalDatabase.__tuTribuDatabasePool;
}

export async function createServerDatabaseClient() {
  const pool = getDatabasePool();

  return {
    async withRequestContext<T>(
      context: RequestDatabaseContext,
      callback: (database: RequestDatabase) => Promise<T>
    ): Promise<T> {
      const client = await pool.connect();
      let wasClientReleased = false;
      const releaseClient = (error?: Error) => {
        if (wasClientReleased) {
          return;
        }

        wasClientReleased = true;
        client.release(error);
      };
      const handleCheckedOutClientError = (error: Error) => {
        releaseClient(error);
      };

      try {
        client.on("error", handleCheckedOutClientError);
        await client.query(DATABASE_TRANSACTION.begin);

        const database = createRequestDatabase(client);
        await database.execute(
          sql`select set_config(${DATABASE_TRANSACTION_SETTING.idleInTransactionSessionTimeout}, ${String(IDLE_IN_TRANSACTION_TIMEOUT_MILLISECONDS)}, true)`
        );
        await database.execute(
          sql`select set_config(${DATABASE_CONTEXT_SETTING.currentUserId}, ${context.userId ?? DATABASE_TRANSACTION.emptySettingValue}, true)`
        );
        await database.execute(
          sql`select set_config(${DATABASE_CONTEXT_SETTING.currentUserEmail}, ${context.email ?? DATABASE_TRANSACTION.emptySettingValue}, true)`
        );
        await database.execute(
          sql`select set_config(${DATABASE_CONTEXT_SETTING.mercadoPagoWebhookVerified}, ${context.mercadoPagoWebhookVerified ? DATABASE_TRANSACTION.verifiedSettingValue : DATABASE_TRANSACTION.emptySettingValue}, true)`
        );

        const result = await callback(database);
        await client.query(DATABASE_TRANSACTION.commit);
        return result;
      } catch (error) {
        if (!wasClientReleased) {
          await client.query(DATABASE_TRANSACTION.rollback);
        }

        throw error;
      } finally {
        client.removeListener("error", handleCheckedOutClientError);
        releaseClient();
      }
    },
  };
}
