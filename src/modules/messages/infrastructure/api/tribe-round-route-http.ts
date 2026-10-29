import {
  TRIBE_ROUND_INPUT_ISSUE,
  type TribeRoundInputIssue,
} from "@/src/modules/messages/infrastructure/api/schemas/tribe-round-request-schemas";
import {
  createPrivateJsonRouteBoundary,
  createPrivateNoStoreJsonResponse,
  type PrivateJsonRouteRequest,
  type PublicDtoResponseInput,
} from "@/src/modules/shared/infrastructure/http/route-input";

/**
 * HTTP wiring of `GET /api/tribes/[slug]/messages`: safe Spanish copy, the
 * single input boundary (params and query, once per request), and public DTO
 * output validation. The round carries viewer state (likes, votes,
 * permissions), so responses are never cached.
 */

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

const tribeRoundRouteBoundary = createPrivateJsonRouteBoundary({
  inputRejectedLogMessage: TRIBE_ROUND_ROUTE_LOG.inputRejectedMessage,
  publicDtoRejectedLogMessage: TRIBE_ROUND_ROUTE_LOG.publicDtoRejectedMessage,
  readInputIssueMessage: (issueMessage = TRIBE_ROUND_INPUT_ISSUE.invalidRoundPage) =>
    isTribeRoundInputIssue(issueMessage)
      ? TRIBE_ROUND_INPUT_ISSUE_MESSAGE[issueMessage]
      : TRIBE_ROUND_ROUTE_RESPONSE.invalidRoundPageMessage,
});

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
export async function parseTribeRoundRouteInput<TParams, TQuery>(
  input: PrivateJsonRouteRequest<TParams, TQuery>
): Promise<TribeRoundRouteInput<TParams, TQuery>> {
  const parsed = await tribeRoundRouteBoundary.parseInput(input);

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
export function createTribeRoundPublicResponse<TDto>(input: PublicDtoResponseInput<TDto>): Response {
  return tribeRoundRouteBoundary.createPublicResponse(input);
}
