import "server-only";

import { Pool } from "pg";

import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const POSTGRES_DEPENDENCY = "postgres";

const POSTGRES_ERROR_CODE = {
  administratorShutdown: "57P01",
} as const;

const POSTGRES_POOL_LOG_MESSAGE = {
  connectionGuardFailed:
    "Failed to apply the idle-in-transaction guard to a new Postgres connection.",
  transientTermination:
    "Postgres idle client was closed by the database backend.",
  unexpectedError:
    "Postgres idle client emitted an unexpected connection error.",
} as const;

const POSTGRES_POOL_LOG_REQUEST_ID = "background";

/**
 * Connection-level idle-in-transaction guard, in milliseconds. Applied to every
 * pooled connection so an abandoned transaction is terminated server-side and
 * its pool slot reclaimed instead of leaking. This covers transactions opened by
 * library adapters that own their own checkout (for example the Better Auth
 * Drizzle adapter), which the request-scoped helper cannot wrap. The window is
 * far larger than any legitimate transaction, so healthy work is never affected.
 */
export const IDLE_IN_TRANSACTION_TIMEOUT_MILLISECONDS = 30000;

const IDLE_IN_TRANSACTION_GUARD = {
  setting: "idle_in_transaction_session_timeout",
  /** Session-level (not transaction-local) so it persists across the pooled connection. */
  statement: "select set_config($1, $2, false)",
} as const;

const POSTGRES_POOL_CONFIGURATION = {
  allowExitOnIdle: true,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 5000,
  // Headroom for concurrent server renders. The Neon pooler tolerates hundreds
  // of connections, so a small per-pool ceiling only starves legitimate
  // concurrency. Three runtime pools at this size stay far below the limit.
  max: 10,
  maxLifetimeSeconds: 60,
} as const;

type CreatePostgresPoolInput = {
  connectionString: string;
  operation: string;
};

type PostgresErrorLike = {
  code?: unknown;
  severity?: unknown;
};

function getPostgresErrorMetadata(error: unknown) {
  const postgresError =
    typeof error === "object" && error !== null
      ? (error as PostgresErrorLike)
      : {};
  const errorCode =
    typeof postgresError.code === "string" ? postgresError.code : undefined;
  const errorSeverity =
    typeof postgresError.severity === "string"
      ? postgresError.severity
      : undefined;
  const isTransientConnectionTermination =
    errorCode === POSTGRES_ERROR_CODE.administratorShutdown;

  return {
    dependency: POSTGRES_DEPENDENCY,
    errorCode,
    errorSeverity,
    isTransientConnectionTermination,
  };
}

/**
 * Creates a Postgres pool with safe background error handling for idle clients.
 *
 * @param input - Connection string and operation label used to configure the pool.
 * @returns Configured Postgres pool.
 */
export function createPostgresPool(input: CreatePostgresPoolInput) {
  const logger = createServerLogger({
    feature: "database",
    operation: input.operation,
    requestId: POSTGRES_POOL_LOG_REQUEST_ID,
  });
  const pool = new Pool({
    ...POSTGRES_POOL_CONFIGURATION,
    connectionString: input.connectionString,
    onConnect: async (client) => {
      try {
        await client.query(IDLE_IN_TRANSACTION_GUARD.statement, [
          IDLE_IN_TRANSACTION_GUARD.setting,
          String(IDLE_IN_TRANSACTION_TIMEOUT_MILLISECONDS),
        ]);
      } catch (error) {
        logger.warn({
          message: POSTGRES_POOL_LOG_MESSAGE.connectionGuardFailed,
          metadata: getPostgresErrorMetadata(error),
          error,
        });
        throw error;
      }
    },
  });

  pool.on("error", (error: unknown) => {
    const metadata = getPostgresErrorMetadata(error);

    if (metadata.isTransientConnectionTermination) {
      logger.warn({
        message: POSTGRES_POOL_LOG_MESSAGE.transientTermination,
        metadata,
        error,
      });
      return;
    }

    logger.error({
      message: POSTGRES_POOL_LOG_MESSAGE.unexpectedError,
      metadata,
      error,
    });
  });

  return pool;
}
