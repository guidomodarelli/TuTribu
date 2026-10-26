import "server-only";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, PoolClient } from "pg";

import {
  createPostgresPool,
  IDLE_IN_TRANSACTION_TIMEOUT_MILLISECONDS,
} from "./postgres-pool";
import {
  getServerDatabaseEnvironment,
  getServerMaintenanceDatabaseEnvironment,
} from "./server-environment";

/**
 * Selects which database connection a server database client uses.
 *
 * `request` is the least-privilege runtime connection used by user-facing
 * request flows. `maintenance` is the privileged connection used by scheduled
 * maintenance work (the orphan-image cleanup cron), which must run as a role
 * that retains EXECUTE on the owner-only SECURITY DEFINER maintenance functions.
 * Admission and messaging write handlers (admission policy, submissions and
 * the academy entry that delegates to them, decisions, cancellations and
 * usage policy) also open their request root with this purpose and derive the
 * actor from the session, as `docs/architecture/academy-admissions.htm`
 * documents; it is not a shortcut around RLS for ordinary request flows.
 */
export const DATABASE_CONNECTION_USAGE = {
  maintenance: "maintenance",
  request: "request",
} as const;

export type DatabaseConnectionUsage =
  (typeof DATABASE_CONNECTION_USAGE)[keyof typeof DATABASE_CONNECTION_USAGE];

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
  maintenanceIdleError: "maintenance_database_pool_idle_error",
} as const;

/**
 * Opens the transaction and applies its local idle guard in one simple-protocol
 * round trip. Both values are server constants, so no caller input is ever
 * interpolated; request settings stay parameterized in their own statement.
 */
const GUARDED_TRANSACTION_BEGIN = `${DATABASE_TRANSACTION.begin}; select set_config('${DATABASE_TRANSACTION_SETTING.idleInTransactionSessionTimeout}', '${String(IDLE_IN_TRANSACTION_TIMEOUT_MILLISECONDS)}', true)`;

type GlobalDatabase = typeof globalThis & {
  __tuTribuDatabasePool?: Pool;
  __tuTribuMaintenanceDatabasePool?: Pool;
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

function getDatabasePool(
  usage: DatabaseConnectionUsage = DATABASE_CONNECTION_USAGE.request
) {
  const globalDatabase = globalThis as GlobalDatabase;

  if (usage === DATABASE_CONNECTION_USAGE.maintenance) {
    if (!globalDatabase.__tuTribuMaintenanceDatabasePool) {
      const { connectionString } = getServerMaintenanceDatabaseEnvironment();
      globalDatabase.__tuTribuMaintenanceDatabasePool = createPostgresPool({
        connectionString,
        operation: DATABASE_POOL_OPERATION.maintenanceIdleError,
      });
    }

    return globalDatabase.__tuTribuMaintenanceDatabasePool;
  }

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
    await client.query(GUARDED_TRANSACTION_BEGIN);

    const database = createRequestDatabase(client);

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

/**
 * Runs one self-contained statement on a freshly checked-out pool client, without opening a transaction.
 *
 * Use it only for a statement that sets and restores its own request-local settings, such as
 * `read_authenticated_account` in standalone mode: PostgreSQL runs it in its own implicit transaction,
 * so those settings end with it and nothing stays on the pooled connection. The client is released
 * exactly like in `runWithGuardedTransaction`, including on connection death.
 *
 * @param pool - Pool to check a client out from.
 * @param runStatement - The single statement to run.
 * @returns The value returned by `runStatement`.
 */
export async function runWithGuardedStatement<T>(
  pool: Pool,
  runStatement: (database: RequestDatabase) => Promise<T>
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
    return await runStatement(createRequestDatabase(client));
  } finally {
    client.removeListener("error", handleCheckedOutClientError);
    releaseClient();
  }
}

export async function createServerDatabaseClient(
  usage: DatabaseConnectionUsage = DATABASE_CONNECTION_USAGE.request
) {
  return createPostgresDatabaseClient(getDatabasePool(usage));
}

/**
 * Applies the standard request context and guarded checkout to an explicitly owned real pool.
 * @param pool - Runtime pool whose lifecycle remains with its composition root.
 * @returns The same request-scoped executor used by the cached server client.
 */
export function createPostgresDatabaseClient(pool: Pool) {
  return {
    async withRequestContext<T>(
      context: RequestDatabaseContext,
      callback: (database: RequestDatabase) => Promise<T>
    ): Promise<T> {
      return runWithGuardedTransaction(pool, callback, (database) => prepareRequestDatabaseContext(database, context));
    },
    /** @param callback - One self-contained statement that sets and restores its own request-local settings. @returns Its result, without a transaction. */
    async withStandaloneStatement<T>(callback: (database: RequestDatabase) => Promise<T>): Promise<T> {
      return runWithGuardedStatement(pool, callback);
    },
  };
}

/**
 * Sets independent request-local settings in one round trip before any application statement.
 * @param database - Existing guarded transaction, after any trusted role selection.
 * @param context - Server-derived identity and explicit webhook authority.
 * @returns After all settings are visible to the next SQL statement; commit and rollback reset them together.
 */
export async function prepareRequestDatabaseContext(database: RequestDatabase, context: RequestDatabaseContext): Promise<void> {
  await database.execute(sql`select
    set_config(${DATABASE_CONTEXT_SETTING.currentUserId}, ${context.userId ?? ""}, true),
    set_config(${DATABASE_CONTEXT_SETTING.currentUserEmail}, ${context.email ?? ""}, true),
    set_config(${DATABASE_CONTEXT_SETTING.mercadoPagoWebhookVerified}, ${context.mercadoPagoWebhookVerified ? DATABASE_TRANSACTION.verifiedSettingValue : ""}, true)
  `);
}
