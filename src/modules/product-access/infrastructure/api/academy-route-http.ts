/**
 * HTTP helpers shared by the academy and verification route handlers.
 *
 * - The request scope (session and modules) is opened by the app-layer
 *   composition helper app/api/tribes/[slug]/academy-route-scope.ts.
 * - Validates params, query and body once at the boundary with Zod.
 * - Validates every public DTO before sending it (allowlist of fields).
 * - Every response is private and never cached (`Cache-Control: no-store`),
 *   so a revoked access takes effect on the next request.
 *
 * @module academy-route-http
 */

import type { z } from "zod";

import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { summarizeValidationIssues } from "@/src/modules/shared/infrastructure/validation/validation-issue-summary";

export const ACADEMY_HTTP_STATUS = {
  badRequest: 400,
  conflict: 409,
  created: 201,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  serviceUnavailable: 503,
  unauthorized: 401,
  unprocessable: 422,
} as const;

export const ACADEMY_ROUTE_MESSAGE = {
  conflict: "Otra persona actualizó este dato. Revisá el estado actual y volvé a intentarlo.",
  forbidden: "No tenés permisos para esta acción.",
  invalidInput: "Revisá los datos ingresados.",
  notFound: "No encontramos lo que buscabas.",
  providerUnavailable: "El proveedor de pagos no respondió. Intentá de nuevo en unos minutos.",
  unauthorized: "Iniciá sesión para continuar.",
  unexpected: "No pudimos completar la acción. Intentá de nuevo.",
} as const;

export const ACADEMY_ROUTE_LOG = {
  dtoRejected: "Academy public DTO rejected",
  feature: "academy",
  inputRejected: "Academy route input rejected",
  scopeFailed: "Academy route scope setup failed",
} as const;

export type ServerLogger = ReturnType<typeof createServerLogger>;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

/**
 * Builds a private JSON response.
 *
 * @param body - JSON body.
 * @param status - HTTP status.
 * @returns Response with no-store caching.
 */
export function createAcademyJsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { headers: NO_STORE_HEADERS, status });
}

/**
 * Validates one input part. Logs the issue paths and codes, never values.
 *
 * @param input - Schema, raw value, part name and logger.
 * @returns Parsed data or a 400 response.
 */
export function parseAcademyRouteInput<TData>(input: {
  logger: ServerLogger;
  part: "body" | "params" | "query";
  schema: z.ZodType<TData>;
  value: unknown;
}): { data: TData; isValid: true } | { isValid: false; response: Response } {
  const parsed = input.schema.safeParse(input.value);

  if (parsed.success) {
    return { data: parsed.data, isValid: true };
  }

  input.logger.warn({
    message: ACADEMY_ROUTE_LOG.inputRejected,
    metadata: { issues: summarizeValidationIssues(parsed.error.issues), part: input.part },
  });

  return {
    isValid: false,
    response: createAcademyJsonResponse(
      { message: ACADEMY_ROUTE_MESSAGE.invalidInput },
      ACADEMY_HTTP_STATUS.badRequest
    ),
  };
}

/**
 * Reads a JSON body; unparseable input is rejected later by its schema.
 *
 * @param request - Incoming request.
 * @returns Parsed JSON or undefined.
 */
export async function readAcademyJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/**
 * Reads the query string as a plain object for schema validation.
 *
 * @param request - Incoming request.
 * @returns Query parameters.
 */
export function readAcademyQuery(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

/**
 * Validates the public DTO before sending it; an unusable DTO becomes a safe
 * 500 and is logged without its content.
 *
 * @param input - Schema, body, status and logging context.
 * @returns Validated response.
 */
export function createAcademyPublicResponse<TDto>(input: {
  body: unknown;
  logger: ServerLogger;
  metadata: Record<string, unknown>;
  schema: z.ZodType<TDto>;
  status: number;
}): Response {
  const parsed = input.schema.safeParse(input.body);

  if (!parsed.success) {
    input.logger.error({
      message: ACADEMY_ROUTE_LOG.dtoRejected,
      metadata: { ...input.metadata, issues: summarizeValidationIssues(parsed.error.issues) },
    });

    return createAcademyJsonResponse(
      { message: ACADEMY_ROUTE_MESSAGE.unexpected },
      ACADEMY_HTTP_STATUS.serverError
    );
  }

  return createAcademyJsonResponse(parsed.data, input.status);
}

/**
 * Logs an unexpected failure with context and returns the safe 500.
 *
 * @param input - Logger, error, message and safe metadata.
 * @returns Safe server error response.
 */
export function createAcademyUnexpectedResponse(input: {
  error: unknown;
  logger: ServerLogger;
  message: string;
  metadata: Record<string, unknown>;
}): Response {
  input.logger.error({ error: input.error, message: input.message, metadata: input.metadata });

  return createAcademyJsonResponse(
    { message: ACADEMY_ROUTE_MESSAGE.unexpected },
    ACADEMY_HTTP_STATUS.serverError
  );
}
