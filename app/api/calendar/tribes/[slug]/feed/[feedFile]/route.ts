import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import {
  tribeEventCalendarFeedParamsSchema,
  tribeEventCalendarFeedQuerySchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-calendar-feed-schemas";
import {
  TRIBE_EVENT_CALENDAR_FEED_HTTP_STATUS,
  buildCalendarFeedEtag,
  createCalendarFeedNotModifiedResponse,
  createCalendarFeedResponse,
  createCalendarFeedTextResponse,
  matchesIfNoneMatch,
  redactCalendarFeedToken,
} from "@/src/modules/events/infrastructure/api/tribe-event-calendar-feed-http";
import { TRIBE_EVENT_ROUTE_RESPONSE } from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { buildTribeCalendarFeedIcsFile } from "@/src/modules/events/infrastructure/calendar/tribe-calendar-feed-ics-file";
import { createCalendarFeedModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { summarizeValidationIssues } from "@/src/modules/shared/infrastructure/validation/validation-issue-summary";

const CALENDAR_FEED_ROUTE_LOG = {
  failureMessage: "Tribe calendar feed failed",
  feature: "events",
  inputRejectedMessage: "Tribe calendar feed input rejected",
  missMessage: "Tribe calendar feed not found",
  operation: "tribe-event-calendar-feed",
  servedMessage: "Tribe calendar feed served",
} as const;

const CALENDAR_FEED_RESULT = {
  notFound: "not_found",
  notModified: "not_modified",
  served: "served",
} as const;

const CALENDAR_FEED_INPUT_PART = {
  params: "params",
  query: "query",
} as const;

type TribeCalendarFeedRouteContext = {
  params: Promise<{
    feedFile: string;
    slug: string;
  }>;
};

/**
 * Query string as a plain object (one string per key, an array when the key
 * repeats), so the schema decides whether repetition is allowed.
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
 * Public subscribed calendar of a tribe (`webcal://` or `https://`). There is
 * no session and no cookie: the personal token in the path is the credential.
 * Every request resolves the token and reads as its owner, so a revoked link
 * or a member who left or was blocked gets the same generic 404 as a link
 * that never existed. The token is never logged: logs carry the slug, the
 * owner id once resolved, and the result.
 */
export async function GET(request: Request, context: TribeCalendarFeedRouteContext) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: CALENDAR_FEED_ROUTE_LOG.feature,
    operation: CALENDAR_FEED_ROUTE_LOG.operation,
    requestId,
  });
  const params = tribeEventCalendarFeedParamsSchema.safeParse(await context.params);

  if (!params.success) {
    // Issue paths and codes only: the rejected value may be a token.
    logger.warn({
      message: CALENDAR_FEED_ROUTE_LOG.inputRejectedMessage,
      metadata: {
        issues: summarizeValidationIssues(params.error.issues),
        part: CALENDAR_FEED_INPUT_PART.params,
        result: CALENDAR_FEED_RESULT.notFound,
      },
    });

    return createCalendarFeedTextResponse(
      TRIBE_EVENT_ROUTE_RESPONSE.calendarFeedNotFoundMessage,
      TRIBE_EVENT_CALENDAR_FEED_HTTP_STATUS.notFound
    );
  }

  const { slug, token } = params.data;
  const query = tribeEventCalendarFeedQuerySchema.safeParse(readQueryObject(request));

  if (!query.success) {
    logger.warn({
      message: CALENDAR_FEED_ROUTE_LOG.inputRejectedMessage,
      metadata: {
        issues: summarizeValidationIssues(query.error.issues),
        part: CALENDAR_FEED_INPUT_PART.query,
        tribeSlug: slug,
      },
    });

    return createCalendarFeedTextResponse(
      TRIBE_EVENT_ROUTE_RESPONSE.invalidEventTypeMessage,
      TRIBE_EVENT_CALENDAR_FEED_HTTP_STATUS.badRequest
    );
  }

  try {
    const modules = await createCalendarFeedModules();
    const feed = await modules.events.useCases.getTribeEventCalendarFeed({
      eventTypes: query.data.type ?? [],
      token,
      tribeSlug: slug,
    });

    if (feed.status !== TRIBE_EVENT_MUTATION_STATUS.found) {
      logger.warn({
        message: CALENDAR_FEED_ROUTE_LOG.missMessage,
        metadata: {
          reason: feed.reason,
          result: CALENDAR_FEED_RESULT.notFound,
          tribeSlug: slug,
          userId: feed.ownerUserId,
        },
      });

      return createCalendarFeedTextResponse(
        TRIBE_EVENT_ROUTE_RESPONSE.calendarFeedNotFoundMessage,
        TRIBE_EVENT_CALENDAR_FEED_HTTP_STATUS.notFound
      );
    }

    const icsFile = buildTribeCalendarFeedIcsFile({
      calendarName: feed.calendarName,
      series: feed.series,
    });
    const etag = buildCalendarFeedEtag(icsFile.content);
    const isNotModified = matchesIfNoneMatch(request, etag);

    logger.info({
      message: CALENDAR_FEED_ROUTE_LOG.servedMessage,
      metadata: {
        result: isNotModified ? CALENDAR_FEED_RESULT.notModified : CALENDAR_FEED_RESULT.served,
        seriesCount: feed.series.length,
        tribeSlug: slug,
        userId: feed.ownerUserId,
      },
    });

    return isNotModified
      ? createCalendarFeedNotModifiedResponse(etag)
      : createCalendarFeedResponse({
          content: icsFile.content,
          contentType: icsFile.contentType,
          etag,
        });
  } catch (error) {
    logger.error({
      message: CALENDAR_FEED_ROUTE_LOG.failureMessage,
      error: redactCalendarFeedToken(error, token),
      metadata: { tribeSlug: slug },
    });

    return createCalendarFeedTextResponse(
      TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCalendarFeedMessage,
      TRIBE_EVENT_CALENDAR_FEED_HTTP_STATUS.serverError
    );
  }
}
