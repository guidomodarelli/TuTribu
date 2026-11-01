/** Summarizes a private error cause chain into loggable class names and closed codes. @module error-cause-summary */
import { CLOSED_FAILURE_CAUSE, ERROR_CAUSE_CODE_PATTERN, ERROR_CAUSE_NAME_PATTERN, ERROR_CAUSE_SUMMARY_MAX_ENTRIES, UNNAMED_ERROR_CAUSE } from "@/src/modules/shared/constants/error-cause-summary";

/** One link of a cause chain: never a message, stack, value or provider payload. */
export type ErrorCauseSummary = { name: string; code?: string };

/** @param value - Any value of a cause chain. @returns Its closed code, when it is a safe one. */
function readClosedCode(value: object): string | undefined {
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" && ERROR_CAUSE_CODE_PATTERN.test(code) ? code : undefined;
}

/** @param value - Any value of a cause chain. @returns Whether it is a plain closed failure (`{ code, cause? }`), not an error instance. */
function isClosedFailure(value: unknown): value is { code: string; cause?: unknown } {
  return typeof value === "object" && value !== null && !(value instanceof Error) && readClosedCode(value) !== undefined;
}

/** @param value - Any thrown value. @returns Its safe class name and closed code, when it has one. */
function summarizeOne(value: unknown): ErrorCauseSummary {
  if (isClosedFailure(value)) return { name: CLOSED_FAILURE_CAUSE, code: value.code };
  if (!(value instanceof Error)) return { name: typeof value };
  const name = ERROR_CAUSE_NAME_PATTERN.test(value.name) ? value.name : UNNAMED_ERROR_CAUSE;
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" && ERROR_CAUSE_CODE_PATTERN.test(code) ? { name, code } : { name };
}

/**
 * Walks `cause` (of errors and of plain closed failures) and `AggregateError.errors` breadth first, so a 500 log says which layer failed and why
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
    if ((current instanceof Error || isClosedFailure(current)) && current.cause !== undefined) pending.push(current.cause);
  }
  return summaries;
}
