import "server-only";

import { Pool } from "pg";

import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const POSTGRES_DEPENDENCY = "postgres";

const POSTGRES_ERROR_CODE = {
  administratorShutdown: "57P01",
} as const;

const POSTGRES_POOL_LOG_MESSAGE = {
  transientTermination:
    "Postgres idle client was closed by the database backend.",
  unexpectedError:
    "Postgres idle client emitted an unexpected connection error.",
} as const;

const POSTGRES_POOL_LOG_REQUEST_ID = "background";

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
  const pool = new Pool({
    connectionString: input.connectionString,
  });
  const logger = createServerLogger({
    feature: "database",
    operation: input.operation,
    requestId: POSTGRES_POOL_LOG_REQUEST_ID,
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
