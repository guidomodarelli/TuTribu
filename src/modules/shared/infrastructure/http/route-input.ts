/**
 * Request input and public DTO boundaries shared by the JSON route adapters:
 * each request part is parsed once against its schema and every success body
 * is validated against its public allowlist before it is sent.
 *
 * @module route-input
 */

import type { z } from "zod";

import type { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { summarizeValidationIssues } from "@/src/modules/shared/infrastructure/validation/validation-issue-summary";

type ServerLogger = ReturnType<typeof createServerLogger>;

const CACHE_CONTROL_HEADER = "Cache-Control";
const PRIVATE_NO_STORE_CACHE_CONTROL = "private, no-store";

/** Request part a route schema validates. */
export type RouteInputPart = "body" | "params" | "query";

/** Response a route returns as is when its input is rejected. */
export type RouteInputRejection = { isValid: false; response: Response };

/**
 * JSON response that no shared cache may store (per user or per viewer data).
 *
 * @param body - Response body.
 * @param status - HTTP status.
 * @returns The JSON response with `Cache-Control: private, no-store`.
 */
export function createPrivateNoStoreJsonResponse(body: unknown, status: number): Response {
  const response = Response.json(body, { status });

  response.headers.set(CACHE_CONTROL_HEADER, PRIVATE_NO_STORE_CACHE_CONTROL);

  return response;
}

/**
 * Query string as a plain object: one string per key, or an array when the
 * key is repeated, so the schema decides whether repetition is allowed.
 *
 * @param request - Incoming request.
 * @returns Query values by key.
 */
function readRequestQueryObject(request: Request): Record<string, string | string[]> {
  const { searchParams } = new URL(request.url);
  const query: Record<string, string | string[]> = {};

  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);

    query[key] = values.length === 1 ? values[0] : values;
  }

  return query;
}

/**
 * Parsed JSON body, or `undefined` when the body is missing or not JSON, which
 * the body schema rejects like any other unusable shape.
 *
 * @param request - Incoming request.
 * @returns Parsed body, or undefined.
 */
async function readRequestJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    // Unparseable JSON is expected client input, rejected by the body schema.
    return undefined;
  }
}

/**
 * Validates params, then query (when the route declares a query schema), then
 * body (when the route takes one), stopping at the first rejected part.
 *
 * @param input - Raw route params, request, schemas, and the rejection builder.
 * @returns The typed parts, or the rejection built for the first invalid part.
 */
export async function parseRouteRequestParts<TParams, TQuery, TBody>(input: {
  params: Promise<unknown>;
  reject: (part: RouteInputPart, error: z.ZodError) => RouteInputRejection;
  request: Request;
  schemas: {
    body?: z.ZodType<TBody>;
    params: z.ZodType<TParams>;
    query?: z.ZodType<TQuery>;
  };
}): Promise<
  { body: TBody; isValid: true; params: TParams; query: TQuery } | RouteInputRejection
> {
  const { request, schemas } = input;
  const params = schemas.params.safeParse(await input.params);

  if (!params.success) {
    return input.reject("params", params.error);
  }

  let query = undefined as TQuery;

  if (schemas.query) {
    const parsedQuery = schemas.query.safeParse(readRequestQueryObject(request));

    if (!parsedQuery.success) {
      return input.reject("query", parsedQuery.error);
    }

    query = parsedQuery.data;
  }

  if (!schemas.body) {
    return { body: undefined as TBody, isValid: true, params: params.data, query };
  }

  const body = schemas.body.safeParse(await readRequestJsonBody(request));

  if (!body.success) {
    return input.reject("body", body.error);
  }

  return { body: body.data, isValid: true, params: params.data, query };
}

/**
 * Validates a public DTO against its allowlist schema. An unusable DTO is
 * logged as an error with only issue paths and codes, never its content.
 *
 * @param input - Candidate body, schema, logger, log message, safe metadata and optional reason.
 * @returns The parsed DTO, or a failure the route turns into a safe 500.
 */
export function parsePublicDto<TDto>(input: {
  body: unknown;
  logMessage: string;
  logger: ServerLogger;
  metadata: Record<string, unknown>;
  reason?: string;
  schema: z.ZodType<TDto>;
}): { data: TDto; success: true } | { success: false } {
  const parsed = input.schema.safeParse(input.body);

  if (parsed.success) {
    return { data: parsed.data, success: true };
  }

  input.logger.error({
    message: input.logMessage,
    metadata: {
      ...input.metadata,
      issues: summarizeValidationIssues(parsed.error.issues),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    },
  });

  return { success: false };
}
