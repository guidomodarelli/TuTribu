/**
 * SQLSTATE codes the repositories recover from, and readers of the code
 * carried by a driver error or by the error it wraps.
 *
 * @module postgres-error
 */

export const POSTGRES_ERROR_CODE = {
  checkViolation: "23514",
  foreignKeyViolation: "23503",
  insufficientPrivilege: "42501",
  undefinedColumn: "42703",
  undefinedFunction: "42883",
  undefinedTable: "42P01",
} as const;

type PostgresErrorShape = { cause?: unknown; code?: string };

function readCauseCode(error: PostgresErrorShape): string | undefined {
  return error.cause &&
    typeof error.cause === "object" &&
    "code" in error.cause
    ? (error.cause as { code?: string }).code
    : undefined;
}

/**
 * Reads the SQLSTATE of an error, falling back to the error it wraps.
 *
 * @param error - Error thrown by the database client.
 * @returns The error code, or undefined when none is available.
 */
export function readPostgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const postgresError = error as PostgresErrorShape;

  if (postgresError.code) {
    return postgresError.code;
  }

  return readCauseCode(postgresError);
}

/**
 * Tells whether an error, or the error it wraps, carries one of the codes.
 *
 * @param error - Error thrown by the database client.
 * @param codes - SQLSTATE codes to match.
 * @returns True when the error's own code or its cause's code is listed.
 */
export function hasPostgresErrorCode(
  error: unknown,
  codes: readonly string[]
): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgresError = error as PostgresErrorShape;
  const causeCode = readCauseCode(postgresError);

  return (
    (postgresError.code !== undefined && codes.includes(postgresError.code)) ||
    (causeCode !== undefined && codes.includes(causeCode))
  );
}
