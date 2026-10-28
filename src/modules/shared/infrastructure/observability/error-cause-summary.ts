/** Summarizes a private error cause chain into loggable class names and closed codes. @module error-cause-summary */
import { ERROR_CAUSE_CODE_PATTERN, ERROR_CAUSE_NAME_PATTERN, ERROR_CAUSE_SUMMARY_MAX_ENTRIES, UNNAMED_ERROR_CAUSE } from "@/src/modules/shared/constants/error-cause-summary";

/** One link of a cause chain: never a message, stack, value or provider payload. */
export type ErrorCauseSummary = { name: string; code?: string };

/** @param value - Any thrown value. @returns Its safe class name and closed code, when it has one. */
function summarizeOne(value: unknown): ErrorCauseSummary {
  if (!(value instanceof Error)) return { name: typeof value };
  const name = ERROR_CAUSE_NAME_PATTERN.test(value.name) ? value.name : UNNAMED_ERROR_CAUSE;
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" && ERROR_CAUSE_CODE_PATTERN.test(code) ? { name, code } : { name };
}

/**
 * Walks `cause` and `AggregateError.errors` breadth first, so a 500 log says which layer failed and why
 * (for example `AdmissionOperationError:unexpected_failure` then `MessagingCryptographyError:invalid_configuration`)
 * without serializing messages, stacks or values.
 * @param cause - Private cause attached to a failure; `undefined` yields no entries.
 * @returns At most `ERROR_CAUSE_SUMMARY_MAX_ENTRIES` links, each visited once.
 */
export function summarizeErrorCauses(cause: unknown): ErrorCauseSummary[] {
  const summaries: ErrorCauseSummary[] = [];
  const visited = new Set<unknown>();
  const pending: unknown[] = cause === undefined ? [] : [cause];
  while (pending.length > 0 && summaries.length < ERROR_CAUSE_SUMMARY_MAX_ENTRIES) {
    const current = pending.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    summaries.push(summarizeOne(current));
    if (current instanceof AggregateError) pending.push(...(current.errors as unknown[]));
    if (current instanceof Error && current.cause !== undefined) pending.push(current.cause);
  }
  return summaries;
}
