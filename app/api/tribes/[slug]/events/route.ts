import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import { readAttendanceStreakResponseFragment } from "@/src/modules/events/infrastructure/api/tribe-event-attendance-streak-response";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_QUERY_PARAM,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
  mapTribeEventMutationStatusResponse,
  readSearchParam,
  readTribeEventMutationBody,
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
  const { slug } = await context.params;
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

  try {
    const result = await modules.events.useCases.listTribeEvents({
      month: readSearchParam(request, TRIBE_EVENT_ROUTE_QUERY_PARAM.month),
      tribeSlug: slug,
    });

    return createJsonResponse(result, TRIBE_EVENT_ROUTE_HTTP_STATUS.ok);
  } catch (error) {
    logger.error({
      message: EVENT_ROUTE_LOG.listFailureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedListMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}

export async function POST(request: Request, context: TribeRouteContext) {
  const { slug } = await context.params;
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

  try {
    const body = await request.json().catch(() => null);
    const mutationBody = readTribeEventMutationBody(body);

    if (mutationBody.status === TRIBE_EVENT_MUTATION_STATUS.invalidCapacity) {
      return mapTribeEventMutationStatusResponse(mutationBody.status);
    }

    const result = await modules.events.useCases.createTribeEvent({
      ...mutationBody.body,
      tribeSlug: slug,
      visibleMonth: readSearchParam(request, TRIBE_EVENT_ROUTE_QUERY_PARAM.month),
    });

    if (result.status === TRIBE_EVENT_MUTATION_STATUS.created) {
      // A new event can start in the past, so it may displace one of the
      // viewer's last finished occurrences, or end before the instant the
      // calendar watches: return the recomputed streak and next refresh.
      const streakFragment = await readAttendanceStreakResponseFragment({
        eventId: result.event.id,
        getTribeEventAttendanceStreak: modules.events.useCases.getTribeEventAttendanceStreak,
        getTribeEventAttendanceStreakNextRefreshAt:
          modules.events.useCases.getTribeEventAttendanceStreakNextRefreshAt,
        logger,
        tribeSlug: slug,
        viewerId: authenticatedMember.id,
      });

      return createJsonResponse(
        {
          ...streakFragment,
          event: result.event,
          message: TRIBE_EVENT_ROUTE_RESPONSE.createSuccessMessage,
          occurrences: result.occurrences,
        },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.created
      );
    }

    return mapTribeEventMutationStatusResponse(result.status);
  } catch (error) {
    logger.error({
      message: EVENT_ROUTE_LOG.createFailureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCreateMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
