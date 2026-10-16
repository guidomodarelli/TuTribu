import "server-only";

const SSL_MODE_PARAMETER = "sslmode";
const LIBPQ_COMPAT_PARAMETER = "uselibpqcompat";
const STRICT_SSL_MODE = "verify-full";

/**
 * The only `uselibpqcompat` value that pg-connection-string treats as an
 * opt-in to libpq semantics; any other value keeps the `verify-full` aliases.
 */
const LIBPQ_COMPAT_ENABLED_VALUE = "true";

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
 * upgrade. Like pg-connection-string, it reads the last occurrence of each
 * query parameter, so the decision matches the effective value pg applies.
 * Connection strings that opt into libpq semantics (`uselibpqcompat=true`),
 * whose effective mode is not an alias, or that are not parseable URLs are
 * returned unchanged; duplicated `sslmode` values collapse into one.
 *
 * @param connectionString - Postgres connection string from the environment.
 * @returns The connection string with an explicit `sslmode=verify-full` when it used an alias.
 */
export function normalizePostgresSslMode(connectionString: string): string {
  if (!URL.canParse(connectionString)) {
    return connectionString;
  }

  const connectionUrl = new URL(connectionString);
  const sslMode = readEffectiveSearchParam(connectionUrl, SSL_MODE_PARAMETER);
  const libpqCompat = readEffectiveSearchParam(connectionUrl, LIBPQ_COMPAT_PARAMETER);

  if (
    sslMode === undefined ||
    !VERIFY_FULL_ALIAS_SSL_MODES.has(sslMode) ||
    libpqCompat === LIBPQ_COMPAT_ENABLED_VALUE
  ) {
    return connectionString;
  }

  connectionUrl.searchParams.set(SSL_MODE_PARAMETER, STRICT_SSL_MODE);

  return connectionUrl.toString();
}

/**
 * Reads the value pg-connection-string applies for a query parameter: the last
 * occurrence, because it copies every entry in order and later ones win.
 *
 * @param connectionUrl - Parsed Postgres connection URL.
 * @param parameterName - Query parameter to read.
 * @returns The last value of the parameter, or `undefined` when it is absent.
 */
function readEffectiveSearchParam(connectionUrl: URL, parameterName: string): string | undefined {
  return connectionUrl.searchParams.getAll(parameterName).at(-1);
}
