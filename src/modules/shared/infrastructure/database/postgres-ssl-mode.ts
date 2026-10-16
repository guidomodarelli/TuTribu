import "server-only";

const SSL_MODE_PARAMETER = "sslmode";
const LIBPQ_COMPAT_PARAMETER = "uselibpqcompat";
const STRICT_SSL_MODE = "verify-full";

/**
 * SSL modes that pg 8 already treats as `verify-full` and warns about, because
 * pg 9 will switch them to the weaker libpq semantics.
 */
const VERIFY_FULL_ALIAS_SSL_MODES: ReadonlySet<string> = new Set([
  "prefer",
  "require",
  "verify-ca",
]);

/**
 * Pins the current strict TLS behavior by rewriting the `sslmode` aliases that
 * pg treats as `verify-full` (`prefer`, `require`, `verify-ca`) to
 * `verify-full`. This silences the pg-connection-string security warning
 * without weakening verification, and keeps the strict behavior after the pg 9
 * upgrade. Connection strings that opt into libpq semantics, use another mode,
 * or are not parseable URLs are returned unchanged.
 *
 * @param connectionString - Postgres connection string from the environment.
 * @returns The connection string with an explicit `sslmode=verify-full` when it used an alias.
 */
export function normalizePostgresSslMode(connectionString: string): string {
  if (!URL.canParse(connectionString)) {
    return connectionString;
  }

  const connectionUrl = new URL(connectionString);
  const sslMode = connectionUrl.searchParams.get(SSL_MODE_PARAMETER);

  if (
    sslMode === null ||
    !VERIFY_FULL_ALIAS_SSL_MODES.has(sslMode) ||
    connectionUrl.searchParams.has(LIBPQ_COMPAT_PARAMETER)
  ) {
    return connectionString;
  }

  connectionUrl.searchParams.set(SSL_MODE_PARAMETER, STRICT_SSL_MODE);

  return connectionUrl.toString();
}
