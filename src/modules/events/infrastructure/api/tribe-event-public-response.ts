import type { z } from "zod";

import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  createJsonResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import type { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import {
  summarizeValidationIssues,
  type ValidationIssueSummary,
} from "@/src/modules/shared/infrastructure/validation/validation-issue-summary";

/**
 * Output boundary of the events middleend: every public DTO (JSON body or
 * page prop) is validated against its schema from
 * `application/results/tribe-event-public-dto-schemas.ts` before it leaves
 * the server. Only the parsed value is sent, so unknown fields never leak.
 */

type ServerLogger = ReturnType<typeof createServerLogger>;

export type TribeEventPublicDtoParseResult<TDto> =
  | { dto: TDto; isUsable: true }
  | { isUsable: false; issues: ValidationIssueSummary[] };

const TRIBE_EVENT_PUBLIC_DTO_LOG = {
  reason: "public_dto_rejected",
  rejectedMessage: "Tribe event public DTO rejected",
} as const;

/**
 * Validates a public DTO and reduces a failure to loggable issue summaries.
 *
 * @param schema - Public DTO schema.
 * @param value - Candidate DTO built by the route or page.
 * @returns The allowlisted DTO, or the issues that made it unusable.
 */
export function parseTribeEventPublicDto<TDto>(
  schema: z.ZodType<TDto>,
  value: unknown
): TribeEventPublicDtoParseResult<TDto> {
  const result = schema.safeParse(value);

  return result.success
    ? { dto: result.data, isUsable: true }
    : { isUsable: false, issues: summarizeValidationIssues(result.error.issues) };
}

/**
 * Logs a rejected public DTO with the issue paths and codes only.
 *
 * @param logger - Request-scoped logger of the route or page.
 * @param issues - Summaries returned by {@link parseTribeEventPublicDto}.
 * @param metadata - Safe business identifiers (slug, eventId, viewerId).
 */
export function logRejectedTribeEventPublicDto(
  logger: ServerLogger,
  issues: ValidationIssueSummary[],
  metadata: Record<string, unknown>
): void {
  logger.error({
    message: TRIBE_EVENT_PUBLIC_DTO_LOG.rejectedMessage,
    metadata: {
      ...metadata,
      issues,
      reason: TRIBE_EVENT_PUBLIC_DTO_LOG.reason,
    },
  });
}

/**
 * Builds the JSON response of a successful route outcome after validating it.
 * An unusable DTO becomes a safe 500 with the route's fallback message.
 *
 * @param input - DTO schema and candidate body, success status, the safe
 * fallback message, the logger, and safe log metadata.
 * @returns The validated JSON response or the safe server error.
 */
export function createTribeEventPublicResponse<TDto>(input: {
  body: unknown;
  failureMessage: string;
  logger: ServerLogger;
  metadata: Record<string, unknown>;
  schema: z.ZodType<TDto>;
  status: number;
}): Response {
  const parsed = parseTribeEventPublicDto(input.schema, input.body);

  if (!parsed.isUsable) {
    logRejectedTribeEventPublicDto(input.logger, parsed.issues, input.metadata);

    return createJsonResponse(
      { message: input.failureMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }

  return Response.json(parsed.dto, { status: input.status });
}
