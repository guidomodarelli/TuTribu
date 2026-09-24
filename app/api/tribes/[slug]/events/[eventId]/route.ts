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
  deleteFailureMessage: "Tribe event deletion failed",
  feature: "events",
  operation: "manage-tribe-event",
  updateFailureMessage: "Tribe event update failed",
} as const;

type TribeEventRouteContext = {
  params: Promise<{
    eventId: string;
    slug: string;
  }>;
};

export async function PATCH(request: Request, context: TribeEventRouteContext) {
  const { eventId, slug } = await context.params;
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

    const result = await modules.events.useCases.updateTribeEvent({
      ...mutationBody.body,
      eventId,
      tribeSlug: slug,
      visibleMonth: readSearchParam(request, TRIBE_EVENT_ROUTE_QUERY_PARAM.month),
    });

    if (result.status === TRIBE_EVENT_MUTATION_STATUS.updated) {
      const streakFragment = await readAttendanceStreakResponseFragment({
        eventId,
        getTribeEventAttendanceStreak: modules.events.useCases.getTribeEventAttendanceStreak,
        logger,
        tribeSlug: slug,
        viewerId: authenticatedMember.id,
      });

      return createJsonResponse(
        {
          ...streakFragment,
          event: result.event,
          message: TRIBE_EVENT_ROUTE_RESPONSE.updateSuccessMessage,
          occurrences: result.occurrences,
        },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
      );
    }

    return mapTribeEventMutationStatusResponse(result.status);
  } catch (error) {
    logger.error({
      message: EVENT_ROUTE_LOG.updateFailureMessage,
      error,
      metadata: {
        eventId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedUpdateMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}

export async function DELETE(request: Request, context: TribeEventRouteContext) {
  const { eventId, slug } = await context.params;
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
    const result = await modules.events.useCases.deleteTribeEvent({
      eventId,
      tribeSlug: slug,
    });

    if (result.status === TRIBE_EVENT_MUTATION_STATUS.deleted) {
      const streakFragment = await readAttendanceStreakResponseFragment({
        eventId,
        getTribeEventAttendanceStreak: modules.events.useCases.getTribeEventAttendanceStreak,
        logger,
        tribeSlug: slug,
        viewerId: authenticatedMember.id,
      });

      return createJsonResponse(
        { ...streakFragment, message: TRIBE_EVENT_ROUTE_RESPONSE.deleteSuccessMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.ok
      );
    }

    return mapTribeEventMutationStatusResponse(result.status);
  } catch (error) {
    logger.error({
      message: EVENT_ROUTE_LOG.deleteFailureMessage,
      error,
      metadata: {
        eventId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedDeleteMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
