/** Request-scoped diagnostics of one SSR page loader: native correlation, cause chains and contract issues, never messages or values. @module server-page-diagnostics */
import "server-only";
import { ZodError, type z } from "zod";
import { resolvePrivateRequestContext } from "./private-request-context";
import { createServerLogger } from "./server-logger";
import { summarizeErrorCauses } from "./error-cause-summary";
import { summarizeValidationIssues } from "../validation/validation-issue-summary";
import type { RequestContext } from "./request-context";

/** Deepest link of a cause chain searched for a contract rejection. */
const VALIDATION_CAUSE_MAX_DEPTH = 6;

/**
 * A use case that rejects its own snapshot keeps the `ZodError` as cause: its issue paths and codes (never the rejected values)
 * say which field broke the contract.
 * @param cause - Private cause chain of a failure.
 * @returns The issues of the first contract rejection in the chain, or none.
 */
function findContractIssues(cause: unknown): { issues?: ReturnType<typeof summarizeValidationIssues> } {
  let current = cause;
  for (let depth = 0; depth < VALIDATION_CAUSE_MAX_DEPTH && typeof current === "object" && current !== null; depth += 1) {
    if (current instanceof ZodError) return { issues: summarizeValidationIssues(current.issues) };
    current = (current as { cause?: unknown }).cause;
  }
  return {};
}

/** Closed failure a page use case returned, with its private cause when it has one. */
type ServerPageFailure = { code: string; cause?: unknown };

/** What one loader reports; every entry carries the closed code and the native request correlation. */
export type ServerPageDiagnostics = {
  /** Correlation read from the incoming request (`x-request-id`, `x-trace-id`), generated only when absent or unusable. */
  context: RequestContext;
  /** A closed failure of the page read: server failures at error level, deterministic refusals at warn, both with their cause chain. */
  readFailed(message: string, failure: ServerPageFailure): void;
  /** The use case answered a state its own page contract rejects: logs the issue paths and codes, never the rejected values. */
  contractRejected(message: string, code: string, issues: readonly z.core.$ZodIssue[]): void;
  /** The composition or the read threw: logs the class names and closed codes of the thrown chain. */
  loadFailed(message: string, code: string, error: unknown): void;
};

/**
 * Mirrors what the JSON route boundary logs for an API failure, so a page and its API answer the same failure with the same diagnostics.
 * @param input - Fixed feature and operation, the incoming request headers (from `headers()` inside the page's Suspense),
 * safe identifiers of the page (never tokens or contacts) and which codes are server failures.
 * @returns The loader's request context and reporters.
 */
export function createServerPageDiagnostics(input: {
  feature: string; operation: string;
  requestHeaders?: Pick<Headers, "get">;
  metadata?: Record<string, string>;
  isServerFailure: (code: string) => boolean;
}): ServerPageDiagnostics {
  const context = resolvePrivateRequestContext(input.requestHeaders ?? new Headers());
  const logger = createServerLogger({ feature: input.feature, operation: input.operation, ...context });
  const fields = (code: string, extra: Record<string, unknown>) => ({ code, ...input.metadata, ...extra });
  return {
    context,
    readFailed(message, failure) {
      const causes = summarizeErrorCauses(failure.cause);
      logger[input.isServerFailure(failure.code) ? "error" : "warn"]({ message, metadata: fields(failure.code, { ...(causes.length > 0 ? { causes } : {}), ...findContractIssues(failure.cause) }) });
    },
    contractRejected(message, code, issues) {
      logger.error({ message, metadata: fields(code, { issues: summarizeValidationIssues(issues) }) });
    },
    loadFailed(message, code, error) {
      logger.error({ message, metadata: fields(code, { causes: summarizeErrorCauses(error), ...findContractIssues(error) }) });
    },
  };
}

/** Application result of one page read, with the closed failure of its feature. */
type ServerPageRead<Code extends string> = { ok: true; value: unknown } | { ok: false; failure: { code: Code; cause?: unknown } };

/** Fixed log messages of one loader: a failed read, a rejected own contract, and a thrown composition or read. */
export type ServerPageDiagnosticMessages = { readFailed: string; contractRejected: string; loadFailed: string };

/**
 * Runs one page read and projects it through its own contract, logging every failure with its cause chain before the safe state is serialized.
 * @param page - Diagnostics of this request, the read, the page contract (and an optional projection before it), the feature's
 * unavailable state builder with its contract and unexpected codes, and the fixed log messages.
 * @returns The own ready state, or the unavailable state of the closed failure.
 */
export async function loadServerPageState<Code extends string, State, Unavailable>(page: {
  diagnostics: ServerPageDiagnostics;
  read: () => Promise<ServerPageRead<Code>>;
  stateSchema: z.ZodType<State>;
  project?: (value: unknown) => unknown;
  unavailable: (code: Code) => Unavailable;
  codes: { contractUnusable: Code; unexpectedFailure: Code };
  messages: ServerPageDiagnosticMessages;
}): Promise<State | Unavailable> {
  try {
    const result = await page.read();
    if (!result.ok) { page.diagnostics.readFailed(page.messages.readFailed, result.failure); return page.unavailable(result.failure.code); }
    const projected = page.stateSchema.safeParse(page.project ? page.project(result.value) : result.value);
    if (projected.success) return projected.data;
    page.diagnostics.contractRejected(page.messages.contractRejected, page.codes.contractUnusable, projected.error.issues);
    return page.unavailable(page.codes.contractUnusable);
  } catch (error) {
    page.diagnostics.loadFailed(page.messages.loadFailed, page.codes.unexpectedFailure, error);
    return page.unavailable(page.codes.unexpectedFailure);
  }
}
