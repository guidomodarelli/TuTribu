import {
  tribeEventListResponseSchema,
  tribeEventSaveResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import { readAttendanceStreakResponseFragment } from "@/src/modules/events/infrastructure/api/tribe-event-attendance-streak-response";
import {
  tribeEventMonthQuerySchema,
  tribeEventMutationBodySchema,
  tribeEventsRouteParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import { createTribeEventPublicResponse } from "@/src/modules/events/infrastructure/api/tribe-event-public-response";
import { parseTribeEventRouteInput } from "@/src/modules/events/infrastructure/api/tribe-event-route-input";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
  mapTribeEventMutationStatusResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const EVENT_ROUTE_LOG = {
  createFailureMessage: "Tribe event creation failed",
  feature: "events",
  listFailureMessage: "Tribe event listing failed",
  operation: "manage-tribe-events",
} as const;

type TribeRouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(request: Request, context: TribeRouteContext) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: EVENT_ROUTE_LOG.feature,
    operation: EVENT_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unauthorizedMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.unauthorized
    );
  }

  const input = await parseTribeEventRouteInput({
    logger,
    params: context.params,
    request,
    schemas: {
      params: tribeEventsRouteParamsSchema,
      query: tribeEventMonthQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { slug } = input.params;
  const logMetadata = { slug, viewerId: authenticatedMember.id };

  try {
    const result = await modules.events.useCases.listTribeEvents({
      month: input.query.month ?? null,
      occurrence: null,
      tribeSlug: slug,
    });

    return createTribeEventPublicResponse({
      body: result,
      failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedListMessage,
      logger,
      metadata: logMetadata,
      schema: tribeEventListResponseSchema,
      status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
    });
  } catch (error) {
    logger.error({
      message: EVENT_ROUTE_LOG.listFailureMessage,
      error,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedListMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}

export async function POST(request: Request, context: TribeRouteContext) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: EVENT_ROUTE_LOG.feature,
    operation: EVENT_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unauthorizedMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.unauthorized
    );
  }

  const input = await parseTribeEventRouteInput({
    logger,
    params: context.params,
    request,
    schemas: {
      body: tribeEventMutationBodySchema,
      params: tribeEventsRouteParamsSchema,
      query: tribeEventMonthQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { slug } = input.params;
  const logMetadata = { slug, viewerId: authenticatedMember.id };

  try {
    const result = await modules.events.useCases.createTribeEvent({
      ...input.body,
      tribeSlug: slug,
      visibleMonth: input.query.month ?? null,
    });

    if (result.status === TRIBE_EVENT_MUTATION_STATUS.created) {
      // A new event can start in the past, so it may displace one of the
      // viewer's last finished occurrences, or end before the instant the
      // calendar watches: return the recomputed streak and next refresh.
      const streakFragment = await readAttendanceStreakResponseFragment({
        eventId: result.event.id,
        getTribeEventAttendanceStreakSnapshot:
          modules.events.useCases.getTribeEventAttendanceStreakSnapshot,
        logger,
        tribeSlug: slug,
        viewerId: authenticatedMember.id,
      });

      return createTribeEventPublicResponse({
        body: {
          ...streakFragment,
          event: result.event,
          message: TRIBE_EVENT_ROUTE_RESPONSE.createSuccessMessage,
          occurrences: result.occurrences,
        },
        failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCreateMessage,
        logger,
        metadata: logMetadata,
        schema: tribeEventSaveResponseSchema,
        status: TRIBE_EVENT_ROUTE_HTTP_STATUS.created,
      });
    }

    return mapTribeEventMutationStatusResponse(result.status);
  } catch (error) {
    logger.error({
      message: EVENT_ROUTE_LOG.createFailureMessage,
      error,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCreateMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
