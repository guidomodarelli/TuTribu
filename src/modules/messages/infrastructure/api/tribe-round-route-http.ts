import type { z } from "zod";

import {
  TRIBE_ROUND_INPUT_ISSUE,
  type TribeRoundInputIssue,
} from "@/src/modules/messages/infrastructure/api/schemas/tribe-round-request-schemas";
import type { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { summarizeValidationIssues } from "@/src/modules/shared/infrastructure/validation/validation-issue-summary";

/**
 * HTTP wiring of `GET /api/tribes/[slug]/messages`: safe Spanish copy, the
 * single input boundary (params and query, once per request), and public DTO
 * output validation. The round carries viewer state (likes, votes,
 * permissions), so responses are never cached.
 */

type ServerLogger = ReturnType<typeof createServerLogger>;

export const TRIBE_ROUND_ROUTE_HTTP_STATUS = {
  badRequest: 400,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

export const TRIBE_ROUND_ROUTE_RESPONSE = {
  invalidRoundPageMessage: "No pudimos cargar esa página de mensajes.",
  tribeNotFoundMessage: "No pudimos encontrar la tribu.",
  unauthorizedMessage: "Iniciá sesión para ver los mensajes.",
  unexpectedRoundMessage: "No pudimos cargar los mensajes. Intentá de nuevo.",
} as const;

const TRIBE_ROUND_ROUTE_LOG = {
  inputRejectedMessage: "Tribe round route input rejected",
  publicDtoRejectedMessage: "Tribe round public DTO rejected",
  publicDtoRejectedReason: "public_dto_rejected",
} as const;

const TRIBE_ROUND_ROUTE_INPUT_PART = {
  params: "params",
  query: "query",
} as const;

type TribeRoundRouteInputPart =
  (typeof TRIBE_ROUND_ROUTE_INPUT_PART)[keyof typeof TRIBE_ROUND_ROUTE_INPUT_PART];

const CACHE_CONTROL_HEADER = "Cache-Control";
const NO_STORE_CACHE_CONTROL = "private, no-store";

const TRIBE_ROUND_INPUT_ISSUE_MESSAGE: Record<TribeRoundInputIssue, string> = {
  [TRIBE_ROUND_INPUT_ISSUE.invalidRoundPage]: TRIBE_ROUND_ROUTE_RESPONSE.invalidRoundPageMessage,
  [TRIBE_ROUND_INPUT_ISSUE.invalidTribeReference]: TRIBE_ROUND_ROUTE_RESPONSE.tribeNotFoundMessage,
};

/**
 * JSON response that no shared cache may store (the round is per viewer).
 *
 * @param body - Response body.
 * @param status - HTTP status.
 * @returns The JSON response with `Cache-Control: private, no-store`.
 */
export function createTribeRoundJsonResponse(body: unknown, status: number): Response {
  const response = Response.json(body, { status });

  response.headers.set(CACHE_CONTROL_HEADER, NO_STORE_CACHE_CONTROL);

  return response;
}

/**
 * Query string as a plain object: one string per key, or an array when the
 * key is repeated, so the schema decides whether repetition is allowed.
 */
function readQueryObject(request: Request): Record<string, string | string[]> {
  const { searchParams } = new URL(request.url);
  const query: Record<string, string | string[]> = {};

  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);

    query[key] = values.length === 1 ? values[0] : values;
  }

  return query;
}

function isTribeRoundInputIssue(value: string): value is TribeRoundInputIssue {
  return Object.hasOwn(TRIBE_ROUND_INPUT_ISSUE_MESSAGE, value);
}

function rejectInput(
  logger: ServerLogger,
  part: TribeRoundRouteInputPart,
  error: z.ZodError
): { isValid: false; response: Response } {
  logger.warn({
    message: TRIBE_ROUND_ROUTE_LOG.inputRejectedMessage,
    metadata: { issues: summarizeValidationIssues(error.issues), part },
  });

  const firstIssueMessage = error.issues[0]?.message ?? TRIBE_ROUND_INPUT_ISSUE.invalidRoundPage;

  return {
    isValid: false,
    response: createTribeRoundJsonResponse(
      {
        message: isTribeRoundInputIssue(firstIssueMessage)
          ? TRIBE_ROUND_INPUT_ISSUE_MESSAGE[firstIssueMessage]
          : TRIBE_ROUND_ROUTE_RESPONSE.invalidRoundPageMessage,
      },
      TRIBE_ROUND_ROUTE_HTTP_STATUS.badRequest
    ),
  };
}

export type TribeRoundRouteInput<TParams, TQuery> =
  | { isValid: true; params: TParams; query: TQuery }
  | { isValid: false; response: Response };

/**
 * Validates the params and query of one request against the route schemas.
 * Invalid input becomes a 400 with safe copy and a `warn` log that carries
 * only issue paths and codes, never the rejected values.
 *
 * @param input - Request, raw route params, schemas, and request logger.
 * @returns The typed input, or the 400 response to return as is.
 */
export async function parseTribeRoundRouteInput<TParams, TQuery>(input: {
  logger: ServerLogger;
  params: Promise<unknown>;
  request: Request;
  schemas: { params: z.ZodType<TParams>; query: z.ZodType<TQuery> };
}): Promise<TribeRoundRouteInput<TParams, TQuery>> {
  const params = input.schemas.params.safeParse(await input.params);

  if (!params.success) {
    return rejectInput(input.logger, TRIBE_ROUND_ROUTE_INPUT_PART.params, params.error);
  }

  const query = input.schemas.query.safeParse(readQueryObject(input.request));

  if (!query.success) {
    return rejectInput(input.logger, TRIBE_ROUND_ROUTE_INPUT_PART.query, query.error);
  }

  return { isValid: true, params: params.data, query: query.data };
}

/**
 * Validates a public DTO against its allowlist schema and sends only the
 * parsed value. An unusable DTO is logged (paths and codes) and becomes a
 * safe 500.
 *
 * @param input - Candidate body, schema, safe fallback copy, logger, and
 * safe log metadata.
 * @returns The validated JSON response or the safe server error.
 */
export function createTribeRoundPublicResponse<TDto>(input: {
  body: unknown;
  failureMessage: string;
  logger: ServerLogger;
  metadata: Record<string, unknown>;
  schema: z.ZodType<TDto>;
}): Response {
  const parsed = input.schema.safeParse(input.body);

  if (!parsed.success) {
    input.logger.error({
      message: TRIBE_ROUND_ROUTE_LOG.publicDtoRejectedMessage,
      metadata: {
        ...input.metadata,
        issues: summarizeValidationIssues(parsed.error.issues),
        reason: TRIBE_ROUND_ROUTE_LOG.publicDtoRejectedReason,
      },
    });

    return createTribeRoundJsonResponse(
      { message: input.failureMessage },
      TRIBE_ROUND_ROUTE_HTTP_STATUS.serverError
    );
  }

  return createTribeRoundJsonResponse(parsed.data, TRIBE_ROUND_ROUTE_HTTP_STATUS.ok);
}
