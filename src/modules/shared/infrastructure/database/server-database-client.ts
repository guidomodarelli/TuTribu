import "server-only";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, PoolClient } from "pg";

import {
  createPostgresPool,
  IDLE_IN_TRANSACTION_TIMEOUT_MILLISECONDS,
} from "./postgres-pool";
import { getServerDatabaseEnvironment } from "./server-environment";

const DATABASE_CONTEXT_SETTING = {
  currentUserEmail: "app.current_user_email",
  currentUserId: "app.current_user_id",
  mercadoPagoWebhookVerified: "app.mercado_pago_webhook_verified",
} as const;
const DATABASE_TRANSACTION = {
  begin: "BEGIN",
  commit: "COMMIT",
  rollback: "ROLLBACK",
  verifiedSettingValue: "true",
} as const;

const DATABASE_TRANSACTION_SETTING = {
  idleInTransactionSessionTimeout: "idle_in_transaction_session_timeout",
} as const;

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

/**
 * Runs work inside a guarded transaction on a freshly checked-out pool client.
 *
 * The client is released even when the awaiting flow is abandoned (an aborted
 * render or `after()` callback): a client `error` listener releases it on
 * connection death, the release is idempotent, and `ROLLBACK` is skipped once
 * the socket has already errored. A local `idle_in_transaction_session_timeout`
 * lets Postgres terminate a transaction abandoned before commit so the pooled
 * connection is reclaimed instead of leaking and starving the pool.
 *
 * Every code path that checks out a pooled client must go through this helper
 * instead of a bare `pool.connect()`/`finally` pair, so the safety net stays in
 * one place.
 *
 * @param pool - Pool to check a client out from.
 * @param runStatements - Work to run against the transaction-scoped database.
 * @param prepare - Optional per-transaction setup run right after the guard,
 *   such as request-scoped row-level-security settings.
 * @returns The value returned by `runStatements`.
 */
export async function runWithGuardedTransaction<T>(
  pool: Pool,
  runStatements: (database: RequestDatabase) => Promise<T>,
  prepare?: (database: RequestDatabase) => Promise<void>
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

    if (prepare) {
      await prepare(database);
    }

    const result = await runStatements(database);
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
}

export async function createServerDatabaseClient() {
  const pool = getDatabasePool();

  return {
    async withRequestContext<T>(
      context: RequestDatabaseContext,
      callback: (database: RequestDatabase) => Promise<T>
    ): Promise<T> {
      return runWithGuardedTransaction(pool, callback, async (database) => {
        await database.execute(
          sql`select set_config(${DATABASE_CONTEXT_SETTING.currentUserId}, ${context.userId ?? ""}, true)`
        );
        await database.execute(
          sql`select set_config(${DATABASE_CONTEXT_SETTING.currentUserEmail}, ${context.email ?? ""}, true)`
        );
        await database.execute(
          sql`select set_config(${DATABASE_CONTEXT_SETTING.mercadoPagoWebhookVerified}, ${context.mercadoPagoWebhookVerified ? DATABASE_TRANSACTION.verifiedSettingValue : ""}, true)`
        );
      });
    },
  };
}
