import "server-only";

const DATABASE_URL_ENV = "DATABASE_URL";
const DATABASE_MIGRATION_URL_ENV = "DATABASE_MIGRATION_URL";
const DATABASE_MAINTENANCE_URL_ENV = "DATABASE_MAINTENANCE_URL";
const DATABASE_ENVIRONMENT_ERROR_MESSAGE =
  "Database environment is incomplete. Set DATABASE_URL.";

/**
 * Reads a connection-string environment variable, treating a blank value as
 * absent so an empty placeholder in `.env` falls through to the next candidate
 * instead of being used as a connection string.
 *
 * @param name - Environment variable name to read.
 * @returns The trimmed connection string, or `undefined` when unset or blank.
 */
function readConnectionStringEnvironment(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value ? value : undefined;
}

/**
 * Resolves the connection used by request-scoped runtime work.
 *
 * @returns The runtime database connection string.
 */
export function getServerDatabaseEnvironment() {
  const connectionString = readConnectionStringEnvironment(DATABASE_URL_ENV);

  if (!connectionString) {
    throw new Error(DATABASE_ENVIRONMENT_ERROR_MESSAGE);
  }

  return {
    connectionString,
  };
}

/**
 * Resolves the connection used by scheduled maintenance work (the orphan-image
 * cleanup cron).
 *
 * The cleanup sweep drives the SECURITY DEFINER maintenance functions, whose
 * EXECUTE privilege the migrations REVOKE from PUBLIC and deliberately never
 * re-grant to a shared request role. In the documented production setup
 * `DATABASE_URL` is a least-privilege runtime role, so running the sweep through
 * it fails with `permission denied` and the sweep never deletes abandoned
 * Cloudflare assets. Maintenance therefore prefers a dedicated privileged
 * connection (`DATABASE_MAINTENANCE_URL`, pointing at the schema owner or a
 * dedicated maintenance role that holds EXECUTE on those functions), falls back
 * to the owner/migration `DATABASE_MIGRATION_URL`, and only falls back to
 * `DATABASE_URL` for setups where the runtime role already owns the schema
 * (local development and early project setup).
 *
 * @returns The maintenance database connection string.
 */
export function getServerMaintenanceDatabaseEnvironment() {
  const connectionString =
    readConnectionStringEnvironment(DATABASE_MAINTENANCE_URL_ENV) ??
    readConnectionStringEnvironment(DATABASE_MIGRATION_URL_ENV) ??
    readConnectionStringEnvironment(DATABASE_URL_ENV);

  if (!connectionString) {
    throw new Error(DATABASE_ENVIRONMENT_ERROR_MESSAGE);
  }

  return {
    connectionString,
  };
}

const POSTGRES_POOL_METRICS_LOG_INTERVAL_ENV = "POSTGRES_POOL_METRICS_LOG_INTERVAL_MS";
/** Shortest accepted window, so a misconfiguration cannot flood the runtime logs. */
const POSTGRES_POOL_METRICS_MINIMUM_INTERVAL_MILLISECONDS = 1000;

/**
 * Resolves the optional pool usage logging. It is off unless
 * `POSTGRES_POOL_METRICS_LOG_INTERVAL_MS` holds an integer of at least one
 * second; any other value keeps it off instead of failing the request.
 *
 * @returns The log interval in milliseconds, or `null` when pool metrics are disabled.
 */
export function getPostgresPoolMetricsEnvironment() {
  const configuredValue = process.env[POSTGRES_POOL_METRICS_LOG_INTERVAL_ENV]?.trim();
  const logIntervalMilliseconds = configuredValue ? Number(configuredValue) : Number.NaN;
  const isEnabled =
    Number.isSafeInteger(logIntervalMilliseconds) &&
    logIntervalMilliseconds >= POSTGRES_POOL_METRICS_MINIMUM_INTERVAL_MILLISECONDS;

  return {
    logIntervalMilliseconds: isEnabled ? logIntervalMilliseconds : null,
  };
}
