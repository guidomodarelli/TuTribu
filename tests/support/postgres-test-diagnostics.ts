/** Projects native database causes into bounded, non-identifying test evidence. @module postgres-test-diagnostics */
import { ADMISSION_REVIEW_SQL_STATE_PATTERN } from "./constants/admission-review-validation";
import { POSTGRES_TEST_DIAGNOSTICS } from "./constants/postgres-test-diagnostics";

/** Contains only native protocol codes and the installed pool's specific checkout-timeout observation. */
export type PostgresTestDiagnostics = { sqlStates: string[]; poolCheckoutTimedOut: boolean };

/**
 * Preserves causal classification while excluding messages, parameters, identifiers and stacks.
 * @param error - Private native driver failure, including wrappers and aggregate recovery causes.
 * @returns Deduplicated SQLSTATE values and a specific pool-wait observation, with cycles bounded.
 */
export function readPostgresTestDiagnostics(error: unknown): PostgresTestDiagnostics {
  const pending = [error], seen = new Set<unknown>(), sqlStates = new Set<string>();
  let poolCheckoutTimedOut = false;
  while (pending.length && seen.size < POSTGRES_TEST_DIAGNOSTICS.maximumCauses) {
    const current = pending.shift();
    if (typeof current !== "object" || current === null || seen.has(current)) continue;
    seen.add(current);
    if ("code" in current && typeof current.code === "string" && ADMISSION_REVIEW_SQL_STATE_PATTERN.test(current.code)) sqlStates.add(current.code);
    if (current instanceof Error && current.message === POSTGRES_TEST_DIAGNOSTICS.poolCheckoutTimeoutMessage) poolCheckoutTimedOut = true;
    if ("cause" in current) pending.push(current.cause);
    if (current instanceof AggregateError) pending.push(...current.errors.slice(0, POSTGRES_TEST_DIAGNOSTICS.maximumCauses));
  }
  return { sqlStates: [...sqlStates].sort(), poolCheckoutTimedOut };
}
