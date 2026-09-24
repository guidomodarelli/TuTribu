import {
  tribeEventDeleteResponseSchema,
  tribeEventSaveResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import { readAttendanceStreakResponseFragment } from "@/src/modules/events/infrastructure/api/tribe-event-attendance-streak-response";
import {
  tribeEventEmptyQuerySchema,
  tribeEventMonthQuerySchema,
  tribeEventUpdateBodySchema,
  tribeEventRouteParamsSchema,
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
      body: tribeEventUpdateBodySchema,
      params: tribeEventRouteParamsSchema,
      query: tribeEventMonthQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { eventId, slug } = input.params;
  const logMetadata = { eventId, slug, viewerId: authenticatedMember.id };

  try {
    const result = await modules.events.useCases.updateTribeEvent({
      ...input.body,
      eventId,
      tribeSlug: slug,
      visibleMonth: input.query.month ?? null,
    });

    if (result.status === TRIBE_EVENT_MUTATION_STATUS.updated) {
      // Editing a past series can change the viewer's last finished
      // occurrences: return the recomputed streak next to the result.
      const streakFragment = await readAttendanceStreakResponseFragment({
        eventId,
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
          message: TRIBE_EVENT_ROUTE_RESPONSE.updateSuccessMessage,
          occurrences: result.occurrences,
        },
        failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedUpdateMessage,
        logger,
        metadata: logMetadata,
        schema: tribeEventSaveResponseSchema,
        status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
      });
    }

    return mapTribeEventMutationStatusResponse(result.status);
  } catch (error) {
    logger.error({
      message: EVENT_ROUTE_LOG.updateFailureMessage,
      error,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedUpdateMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}

export async function DELETE(request: Request, context: TribeEventRouteContext) {
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
      params: tribeEventRouteParamsSchema,
      query: tribeEventEmptyQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { eventId, slug } = input.params;
  const logMetadata = { eventId, slug, viewerId: authenticatedMember.id };

  try {
    const result = await modules.events.useCases.deleteTribeEvent({
      eventId,
      tribeSlug: slug,
    });

    if (result.status === TRIBE_EVENT_MUTATION_STATUS.deleted) {
      const streakFragment = await readAttendanceStreakResponseFragment({
        eventId,
        getTribeEventAttendanceStreakSnapshot:
          modules.events.useCases.getTribeEventAttendanceStreakSnapshot,
        logger,
        tribeSlug: slug,
        viewerId: authenticatedMember.id,
      });

      return createTribeEventPublicResponse({
        body: { ...streakFragment, message: TRIBE_EVENT_ROUTE_RESPONSE.deleteSuccessMessage },
        failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedDeleteMessage,
        logger,
        metadata: logMetadata,
        schema: tribeEventDeleteResponseSchema,
        status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
      });
    }

    return mapTribeEventMutationStatusResponse(result.status);
  } catch (error) {
    logger.error({
      message: EVENT_ROUTE_LOG.deleteFailureMessage,
      error,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedDeleteMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
