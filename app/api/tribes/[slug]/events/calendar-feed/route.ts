import type { z } from "zod";

import {
  tribeEventCalendarFeedIssueResponseSchema,
  tribeEventCalendarFeedRevokeResponseSchema,
  tribeEventCalendarFeedStatusResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import { tribeEventCalendarFeedIssueBodySchema } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-calendar-feed-schemas";
import {
  tribeEventEmptyQuerySchema,
  tribeEventsRouteParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import { createTribeEventPublicResponse } from "@/src/modules/events/infrastructure/api/tribe-event-public-response";
import { parseTribeEventRouteInput } from "@/src/modules/events/infrastructure/api/tribe-event-route-input";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { buildTribeEventCalendarFeedUrl } from "@/src/modules/events/infrastructure/calendar/tribe-event-calendar-feed-url";
import { createRequestModules } from "@/src/modules/setup";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const CALENDAR_FEED_SUBSCRIPTION_LOG = {
  feature: "events",
  baseUrlFailureMessage:
    "Tribe calendar feed public base URL is invalid; token not rotated",
  issueFailureMessage: "Tribe calendar feed token issue failed",
  operation: "tribe-event-calendar-feed-subscription",
  revokeFailureMessage: "Tribe calendar feed token revoke failed",
  statusFailureMessage: "Tribe calendar feed subscription lookup failed",
} as const;
const CACHE_CONTROL_HEADER = "Cache-Control";
/** The issued URL carries a credential: no cache may keep the response. */
const NO_STORE_CACHE_CONTROL = "private, no-store";

type TribeEventsRouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

function withNoStore(response: Response): Response {
  response.headers.set(CACHE_CONTROL_HEADER, NO_STORE_CACHE_CONTROL);

  return response;
}

function mapFailureStatusResponse(status: string): Response {
  switch (status) {
    case TRIBE_EVENT_MUTATION_STATUS.notFound:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.tribeNotFoundMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.notFound
      );
    // The active link is no longer the one the client showed: nothing was
    // issued nor revoked.
    case TRIBE_EVENT_MUTATION_STATUS.feedTokenChanged:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.calendarFeedChangedMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.conflict
      );
    default:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.calendarFeedForbiddenMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.forbidden
      );
  }
}

/**
 * Session, boundary input (slug and, for POST, the body; no query), and the
 * request logger shared by the three verbs.
 */
async function resolveSubscriptionRequest<TBody = undefined>(
  request: Request,
  context: TribeEventsRouteContext,
  bodySchema?: z.ZodType<TBody>
) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: CALENDAR_FEED_SUBSCRIPTION_LOG.feature,
    operation: CALENDAR_FEED_SUBSCRIPTION_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return {
      isResolved: false,
      response: createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.unauthorizedMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.unauthorized
      ),
    } as const;
  }

  const input = await parseTribeEventRouteInput({
    logger,
    params: context.params,
    request,
    schemas: {
      body: bodySchema,
      params: tribeEventsRouteParamsSchema,
      query: tribeEventEmptyQuerySchema,
    },
  });

  if (!input.isValid) {
    return { isResolved: false, response: input.response } as const;
  }

  return {
    body: input.body,
    isResolved: true,
    logger,
    metadata: { tribeSlug: input.params.slug, userId: authenticatedMember.id },
    modules,
    tribeSlug: input.params.slug,
  } as const;
}

/**
 * Whether the signed-in member has an active calendar link for the tribe.
 */
export async function GET(
  request: Request,
  context: TribeEventsRouteContext
): Promise<Response> {
  const resolved = await resolveSubscriptionRequest(request, context);

  if (!resolved.isResolved) {
    return resolved.response;
  }

  const { logger, metadata, modules, tribeSlug } = resolved;

  try {
    const result = await modules.events.useCases.getTribeEventCalendarFeedSubscription({
      tribeSlug,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.found) {
      return mapFailureStatusResponse(result.status);
    }

    return withNoStore(
      createTribeEventPublicResponse({
        body: { subscription: result.subscription },
        failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCalendarFeedSubscriptionStatusMessage,
        logger,
        metadata,
        schema: tribeEventCalendarFeedStatusResponseSchema,
        status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
      })
    );
  } catch (error) {
    logger.error({ message: CALENDAR_FEED_SUBSCRIPTION_LOG.statusFailureMessage, error, metadata });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCalendarFeedSubscriptionStatusMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}

/**
 * Generates (or regenerates, revoking the previous one) the personal link and
 * returns it once. The response is never cached and the token never logged.
 * The public base URL is resolved before issuing: issuing commits the
 * rotation, so failing afterwards would revoke the member's current link
 * without ever revealing the replacement. The body carries the id of the
 * subscription the client knows (optimistic precondition): when another tab
 * or a retry already changed the active link, it answers 409 and issues no
 * credential, so a response never carries an already revoked token.
 */
export async function POST(
  request: Request,
  context: TribeEventsRouteContext
): Promise<Response> {
  const resolved = await resolveSubscriptionRequest(
    request,
    context,
    tribeEventCalendarFeedIssueBodySchema
  );

  if (!resolved.isResolved) {
    return resolved.response;
  }

  const { body, logger, metadata, modules, tribeSlug } = resolved;
  let publicAppBaseUrl: string;

  try {
    publicAppBaseUrl = resolvePublicAppBaseUrl();
  } catch (error) {
    logger.error({ message: CALENDAR_FEED_SUBSCRIPTION_LOG.baseUrlFailureMessage, error, metadata });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCalendarFeedSubscriptionMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }

  try {
    const result = await modules.events.useCases.issueTribeEventCalendarFeedToken({
      expectedSubscriptionId: body.expectedSubscriptionId,
      tribeSlug,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.feedTokenIssued) {
      return mapFailureStatusResponse(result.status);
    }

    return withNoStore(
      createTribeEventPublicResponse({
        body: {
          feedUrl: buildTribeEventCalendarFeedUrl({
            baseUrl: publicAppBaseUrl,
            token: result.token,
            tribeSlug,
          }),
          message: TRIBE_EVENT_ROUTE_RESPONSE.calendarFeedIssuedMessage,
          subscription: result.subscription,
        },
        failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCalendarFeedSubscriptionMessage,
        logger,
        metadata,
        schema: tribeEventCalendarFeedIssueResponseSchema,
        status: TRIBE_EVENT_ROUTE_HTTP_STATUS.created,
      })
    );
  } catch (error) {
    logger.error({ message: CALENDAR_FEED_SUBSCRIPTION_LOG.issueFailureMessage, error, metadata });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCalendarFeedSubscriptionMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}

/**
 * "Desactivar suscripción": revokes the active link (idempotent).
 */
export async function DELETE(
  request: Request,
  context: TribeEventsRouteContext
): Promise<Response> {
  const resolved = await resolveSubscriptionRequest(request, context);

  if (!resolved.isResolved) {
    return resolved.response;
  }

  const { logger, metadata, modules, tribeSlug } = resolved;

  try {
    const result = await modules.events.useCases.revokeTribeEventCalendarFeedToken({ tribeSlug });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.feedTokenRevoked) {
      return mapFailureStatusResponse(result.status);
    }

    return withNoStore(
      createTribeEventPublicResponse({
        body: {
          message: TRIBE_EVENT_ROUTE_RESPONSE.calendarFeedRevokedMessage,
          subscription: null,
        },
        failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCalendarFeedSubscriptionMessage,
        logger,
        metadata,
        schema: tribeEventCalendarFeedRevokeResponseSchema,
        status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
      })
    );
  } catch (error) {
    logger.error({ message: CALENDAR_FEED_SUBSCRIPTION_LOG.revokeFailureMessage, error, metadata });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCalendarFeedSubscriptionMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
