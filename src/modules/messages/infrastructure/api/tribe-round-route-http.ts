import type { z } from "zod";

import {
  TRIBE_ROUND_INPUT_ISSUE,
  type TribeRoundInputIssue,
} from "@/src/modules/messages/infrastructure/api/schemas/tribe-round-request-schemas";
import type { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import {
  createPrivateNoStoreJsonResponse,
  parsePublicDto,
  parseRouteRequestParts,
  type RouteInputPart,
  type RouteInputRejection,
} from "@/src/modules/shared/infrastructure/http/route-input";
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
  return createPrivateNoStoreJsonResponse(body, status);
}

function isTribeRoundInputIssue(value: string): value is TribeRoundInputIssue {
  return Object.hasOwn(TRIBE_ROUND_INPUT_ISSUE_MESSAGE, value);
}

function rejectInput(
  logger: ServerLogger,
  part: RouteInputPart,
  error: z.ZodError
): RouteInputRejection {
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
  const parsed = await parseRouteRequestParts({
    params: input.params,
    reject: (part, error) => rejectInput(input.logger, part, error),
    request: input.request,
    schemas: input.schemas,
  });

  return parsed.isValid
    ? { isValid: true, params: parsed.params, query: parsed.query }
    : parsed;
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
  const parsed = parsePublicDto({
    body: input.body,
    logMessage: TRIBE_ROUND_ROUTE_LOG.publicDtoRejectedMessage,
    logger: input.logger,
    metadata: input.metadata,
    reason: TRIBE_ROUND_ROUTE_LOG.publicDtoRejectedReason,
    schema: input.schema,
  });

  if (!parsed.success) {
    return createTribeRoundJsonResponse(
      { message: input.failureMessage },
      TRIBE_ROUND_ROUTE_HTTP_STATUS.serverError
    );
  }

  return createTribeRoundJsonResponse(parsed.data, TRIBE_ROUND_ROUTE_HTTP_STATUS.ok);
}
