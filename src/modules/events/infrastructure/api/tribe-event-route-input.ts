import type { z } from "zod";

import {
  TRIBE_EVENT_INPUT_ISSUE,
  isTribeEventInputIssue,
  type TribeEventInputIssue,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-input-issue";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import type { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { summarizeValidationIssues } from "@/src/modules/shared/infrastructure/validation/validation-issue-summary";

/**
 * Single input boundary of the tribe event route handlers: it validates the
 * route params, the query string, and (when the route takes one) the JSON
 * body against their schemas, once per request. Handlers and use cases only
 * see the typed output; invalid input becomes a 400 with safe Spanish copy and
 * a structured `warn` log that carries issue paths and codes, never values.
 */

type ServerLogger = ReturnType<typeof createServerLogger>;

type TribeEventRouteInputSchemas<TParams, TQuery, TBody> = {
  body?: z.ZodType<TBody>;
  params: z.ZodType<TParams>;
  query: z.ZodType<TQuery>;
};

export type TribeEventRouteInput<TParams, TQuery, TBody> =
  | {
      body: TBody;
      isValid: true;
      params: TParams;
      query: TQuery;
    }
  | {
      isValid: false;
      response: Response;
    };

const TRIBE_EVENT_ROUTE_INPUT_LOG = {
  rejectedMessage: "Tribe event route input rejected",
} as const;

const TRIBE_EVENT_ROUTE_INPUT_PART = {
  body: "body",
  params: "params",
  query: "query",
} as const;

type TribeEventRouteInputPart =
  (typeof TRIBE_EVENT_ROUTE_INPUT_PART)[keyof typeof TRIBE_EVENT_ROUTE_INPUT_PART];

const TRIBE_EVENT_INPUT_ISSUE_MESSAGE: Record<TribeEventInputIssue, string> = {
  [TRIBE_EVENT_INPUT_ISSUE.invalidAttendance]: TRIBE_EVENT_ROUTE_RESPONSE.invalidAttendanceMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidCalendarFeed]: TRIBE_EVENT_ROUTE_RESPONSE.calendarFeedNotFoundMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidCalendarFeedSubscription]:
    TRIBE_EVENT_ROUTE_RESPONSE.calendarFeedChangedMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidCapacity]: TRIBE_EVENT_ROUTE_RESPONSE.invalidCapacityMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidComment]: TRIBE_EVENT_ROUTE_RESPONSE.invalidCommentMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidCommentReference]:
    TRIBE_EVENT_ROUTE_RESPONSE.commentNotFoundMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidDate]: TRIBE_EVENT_ROUTE_RESPONSE.invalidDateMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidEventReference]: TRIBE_EVENT_ROUTE_RESPONSE.eventNotFoundMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidEventType]: TRIBE_EVENT_ROUTE_RESPONSE.invalidEventTypeMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidException]: TRIBE_EVENT_ROUTE_RESPONSE.invalidExceptionMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidInput]: TRIBE_EVENT_ROUTE_RESPONSE.invalidInputMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidMaterials]: TRIBE_EVENT_ROUTE_RESPONSE.invalidMaterialsMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidMeetingUrl]: TRIBE_EVENT_ROUTE_RESPONSE.invalidMeetingUrlMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidMonth]: TRIBE_EVENT_ROUTE_RESPONSE.invalidMonthMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidMove]: TRIBE_EVENT_ROUTE_RESPONSE.invalidMoveMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidOccurrenceReference]:
    TRIBE_EVENT_ROUTE_RESPONSE.invalidOccurrenceMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidProposal]: TRIBE_EVENT_ROUTE_RESPONSE.invalidProposalMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidProposalReference]:
    TRIBE_EVENT_ROUTE_RESPONSE.proposalNotFoundMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidReaction]: TRIBE_EVENT_ROUTE_RESPONSE.invalidReactionMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidRecording]: TRIBE_EVENT_ROUTE_RESPONSE.invalidRecordingMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidRecurrence]: TRIBE_EVENT_ROUTE_RESPONSE.invalidRecurrenceMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidReviewNote]: TRIBE_EVENT_ROUTE_RESPONSE.invalidReviewNoteMessage,
  [TRIBE_EVENT_INPUT_ISSUE.invalidTribeReference]: TRIBE_EVENT_ROUTE_RESPONSE.tribeNotFoundMessage,
};

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

/**
 * Parsed JSON body, or `undefined` when the body is missing or not JSON, which
 * the body schema rejects like any other unusable shape.
 */
async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    // Unparseable JSON is expected client input, rejected by the schema below.
    return undefined;
  }
}

/**
 * Safe Spanish copy for the first issue. Every schema rule declares its
 * category; an undeclared message falls back to the generic invalid input.
 */
function resolveRejectionMessage(issues: readonly z.core.$ZodIssue[]): string {
  const issueMessage = issues[0]?.message ?? TRIBE_EVENT_INPUT_ISSUE.invalidInput;

  return isTribeEventInputIssue(issueMessage)
    ? TRIBE_EVENT_INPUT_ISSUE_MESSAGE[issueMessage]
    : TRIBE_EVENT_ROUTE_RESPONSE.invalidInputMessage;
}

function rejectInput(
  logger: ServerLogger,
  part: TribeEventRouteInputPart,
  error: z.ZodError
): { isValid: false; response: Response } {
  logger.warn({
    message: TRIBE_EVENT_ROUTE_INPUT_LOG.rejectedMessage,
    metadata: {
      issues: summarizeValidationIssues(error.issues),
      part,
    },
  });

  return {
    isValid: false,
    response: createJsonResponse(
      { message: resolveRejectionMessage(error.issues) },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.badRequest
    ),
  };
}

/**
 * Validates params, query, and body of one request against the route schemas.
 *
 * @param input - Request, raw route params, the route schemas, and the
 * request-scoped logger.
 * @returns The typed input, or the 400 response to return as is.
 */
export async function parseTribeEventRouteInput<TParams, TQuery, TBody = undefined>(input: {
  logger: ServerLogger;
  params: Promise<unknown>;
  request: Request;
  schemas: TribeEventRouteInputSchemas<TParams, TQuery, TBody>;
}): Promise<TribeEventRouteInput<TParams, TQuery, TBody>> {
  const { logger, request, schemas } = input;
  const params = schemas.params.safeParse(await input.params);

  if (!params.success) {
    return rejectInput(logger, TRIBE_EVENT_ROUTE_INPUT_PART.params, params.error);
  }

  const query = schemas.query.safeParse(readQueryObject(request));

  if (!query.success) {
    return rejectInput(logger, TRIBE_EVENT_ROUTE_INPUT_PART.query, query.error);
  }

  if (!schemas.body) {
    return {
      body: undefined as TBody,
      isValid: true,
      params: params.data,
      query: query.data,
    };
  }

  const body = schemas.body.safeParse(await readJsonBody(request));

  if (!body.success) {
    return rejectInput(logger, TRIBE_EVENT_ROUTE_INPUT_PART.body, body.error);
  }

  return { body: body.data, isValid: true, params: params.data, query: query.data };
}
