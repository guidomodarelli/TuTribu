/** Implements own JSON input/output boundaries with safe request-scoped diagnostics. */
import "server-only";
import type { z } from "zod";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { attachRequestContextToResponse, resolveRequestContext, REQUEST_ID_HEADER, TRACE_ID_HEADER } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { summarizeValidationIssues, type ValidationIssueSummary } from "@/src/modules/shared/infrastructure/validation/validation-issue-summary";

const PRIVATE_RESPONSE_HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" } as const;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const INPUT_BODY_PART = "body";
const DIAGNOSTIC_STAGE = { input: "input", publicDto: "public_dto", operation: "operation" } as const;
const BOUNDARY_DIAGNOSTIC_MESSAGE = "Own JSON route boundary rejected an operation";

export type OwnHttpDiagnostic = {
  stage: "input" | "public_dto" | "operation"; code: string; status: number;
  requestId: string; traceId: string; issues?: ValidationIssueSummary[];
};
type OwnInputResult<Value> = { usable: true; value: Value } | { usable: false; response: Response };

/**
 * Creates a reusable infrastructure boundary, never an upstream schema validator.
 *
 * Each input part is claimed before reading/validation. Every emitted value is
 * parsed against the feature's own DTO schema. Only closed diagnostic fields
 * reach the shared logger; raw exception messages, rejected values and causes do
 * not. Feature factories own semantic codes, copy and HTTP status mapping.
 *
 * @param input - Request, fixed operation name and feature-owned contracts.
 * @returns Input parsers, response projection and a private exception boundary.
 */
export function createOwnJsonRouteBoundary<Failure extends { code: string }, PublicError extends { requestId: string }>(input: {
  request: Request; feature: string; operation: string;
  errorSchema: z.ZodType<PublicError>;
  projectFailure: (failure: Failure, requestId: string) => { status: number; body: PublicError };
  invalidInput: () => Failure; unusableContract: () => Failure; unexpectedFailure: (cause: unknown) => Failure;
  diagnostics?: (diagnostic: OwnHttpDiagnostic) => void;
}) {
  const headers = new Headers();
  for (const name of [REQUEST_ID_HEADER, TRACE_ID_HEADER]) {
    const value = input.request.headers.get(name)?.trim();
    if (value && CORRELATION_ID_PATTERN.test(value)) headers.set(name, value);
  }
  const requestContext = resolveRequestContext(headers);
  const logger = createServerLogger({ feature: input.feature, operation: input.operation, ...requestContext });
  const consumedParts = new Set<string>();
  const diagnose = (stage: OwnHttpDiagnostic["stage"], failure: Failure, status: number, issues?: ValidationIssueSummary[]) => {
    const diagnostic: OwnHttpDiagnostic = { stage, code: failure.code, status, ...requestContext, ...(issues ? { issues } : {}) };
    if (input.diagnostics) input.diagnostics(diagnostic);
    else logger[status >= HTTP_STATUS.serverError ? "error" : "warn"]({ message: BOUNDARY_DIAGNOSTIC_MESSAGE, metadata: diagnostic });
  };
  const jsonResponse = (body: unknown, status: number) => attachRequestContextToResponse(Response.json(body, { status, headers: PRIVATE_RESPONSE_HEADERS }), requestContext);

  /** Validates a newly projected own error too, so private or contradictory metadata cannot escape. */
  const failureResponse = (failure: Failure): Response => {
    const projection = input.projectFailure(failure, requestContext.requestId);
    const parsed = input.errorSchema.safeParse(projection.body);
    if (!parsed.success) {
      const fallback = input.unusableContract();
      const safe = input.projectFailure(fallback, requestContext.requestId);
      diagnose(DIAGNOSTIC_STAGE.publicDto, fallback, safe.status, summarizeValidationIssues(parsed.error.issues));
      return jsonResponse(input.errorSchema.parse(safe.body), safe.status);
    }
    diagnose(DIAGNOSTIC_STAGE.operation, failure, projection.status);
    return jsonResponse(parsed.data, projection.status);
  };
  const claimPart = (part: string): boolean => {
    if (consumedParts.has(part)) return false;
    consumedParts.add(part);
    return true;
  };
  const validateClaimed = <Value>(schema: z.ZodType<Value>, value: unknown): OwnInputResult<Value> => {
    const parsed = schema.safeParse(value);
    if (parsed.success) return { usable: true, value: parsed.data };
    const failure = input.invalidInput();
    const projection = input.projectFailure(failure, requestContext.requestId);
    diagnose(DIAGNOSTIC_STAGE.input, failure, projection.status, summarizeValidationIssues(parsed.error.issues));
    return { usable: false, response: jsonResponse(input.errorSchema.parse(projection.body), projection.status) };
  };
  return {
    requestContext,
    /** Validates one already-resolved params/query input before any application effects. */
    input<Value>(part: "params" | "query", schema: z.ZodType<Value>, value: unknown): OwnInputResult<Value> {
      if (!claimPart(part)) return { usable: false, response: failureResponse(input.unexpectedFailure(undefined)) };
      return validateClaimed(schema, value);
    },
    /** Claims JSON once; an explicitly selected empty-body value still passes the same real input schema. */
    async readBody<Value>(schema: z.ZodType<Value>, options?: { emptyBodyValue: unknown }): Promise<OwnInputResult<Value>> {
      if (!claimPart(INPUT_BODY_PART)) return { usable: false, response: failureResponse(input.unexpectedFailure(undefined)) };
      try {
        let body: unknown;
        if (options) {
          const text = await input.request.text();
          body = text.length === 0 ? options.emptyBodyValue : JSON.parse(text);
        } else body = await input.request.json();
        return validateClaimed(schema, body);
      } catch (error) {
        if (input.request.signal.aborted) throw input.request.signal.reason;
        return { usable: false, response: failureResponse(error instanceof SyntaxError ? input.invalidInput() : input.unexpectedFailure(error)) };
      }
    },
    /** Emits only an own public DTO or a safe contract failure; no raw result reaches JSON. */
    success<Value>(schema: z.ZodType<Value>, value: unknown, status: number = HTTP_STATUS.ok): Response {
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        const failure = input.unusableContract();
        const projection = input.projectFailure(failure, requestContext.requestId);
        diagnose(DIAGNOSTIC_STAGE.publicDto, failure, projection.status, summarizeValidationIssues(parsed.error.issues));
        return jsonResponse(input.errorSchema.parse(projection.body), projection.status);
      }
      return jsonResponse(parsed.data, status);
    },
    failure: failureResponse,
    /** Intentional request cancellation propagates; other throws become safe private failures. */
    unexpected(error: unknown): Response {
      if (input.request.signal.aborted) throw input.request.signal.reason;
      return failureResponse(input.unexpectedFailure(error));
    },
  };
}
