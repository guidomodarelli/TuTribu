import type { z } from "zod";

/**
 * Loggable summary of one schema issue: where it happened and which rule
 * failed. It never carries the rejected value, so logs stay free of user
 * input, tokens, or raw payloads.
 */
export type ValidationIssueSummary = {
  code: string;
  path: string;
};

const ISSUE_PATH_SEPARATOR = ".";

/**
 * Reduces schema issues to their path and code for structured logs.
 *
 * @param issues - Issues reported by a failed `safeParse`.
 * @returns One entry per issue, without input values or messages.
 */
export function summarizeValidationIssues(
  issues: readonly z.core.$ZodIssue[]
): ValidationIssueSummary[] {
  return issues.map((issue) => ({
    code: issue.code,
    path: issue.path.map(String).join(ISSUE_PATH_SEPARATOR),
  }));
}
