/** Keeps native fixture failures actionable without persisting private driver messages or parameters. @module admission-review-history-diagnostics */
import { ADMISSION_REVIEW_SQL_STATE_PATTERN } from "./constants/admission-review-validation";
import { ADMISSION_REVIEW_HISTORY_VALIDATION as VALIDATION } from "./constants/admission-review-history-validation";

/** @param error - Private original fixture/driver failure. @param stage - Fixed fixture-owned progress label. @returns A sanitized test boundary error containing only SQLSTATE and bounded catalog identifiers. */
export function createAdmissionReviewHistoryTestError(error: unknown, stage: string): Error {
  let current = error;
  const seen = new Set<unknown>();
  let state: string | null = null, constraint: string | null = null, guard: string | null = null;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && typeof current.code === "string" && ADMISSION_REVIEW_SQL_STATE_PATTERN.test(current.code)) {
      state = current.code;
      if ("constraint" in current && typeof current.constraint === "string" && VALIDATION.sqlObjectNamePattern.test(current.constraint)) constraint = current.constraint;
      if ("where" in current && typeof current.where === "string") guard = VALIDATION.sqlGuardPattern.exec(current.where)?.[1] ?? null;
      break;
    }
    current = current.cause;
  }
  // This export boundary deliberately excludes the private cause and its SQL parameters from Vitest reports.
  return new Error(`Native request history validation stopped at ${stage}; SQLSTATE=${state ?? "unavailable"}; constraint=${constraint ?? "unavailable"}; guard=${guard ?? "unavailable"}`);
}
