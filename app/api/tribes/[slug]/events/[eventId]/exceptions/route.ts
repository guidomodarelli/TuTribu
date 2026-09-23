import { tribeEventExceptionResponseSchema } from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
} from "@/src/modules/events/constants/tribe-events";
import {
  tribeEventExceptionClearQuerySchema,
  tribeEventExceptionSaveQuerySchema,
  tribeEventOccurrenceExceptionBodySchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-exception-request-schemas";
import { tribeEventRouteParamsSchema } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import { createTribeEventPublicResponse } from "@/src/modules/events/infrastructure/api/tribe-event-public-response";
import { parseTribeEventRouteInput } from "@/src/modules/events/infrastructure/api/tribe-event-route-input";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
  mapTribeEventExceptionStatusResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const EXCEPTION_ROUTE_LOG = {
  clearFailureMessage: "Tribe event occurrence restore failed",
  feature: "events",
  operation: "tribe-event-occurrence-exception",
  saveFailureMessage: "Tribe event occurrence exception failed",
} as const;

type TribeEventRouteContext = {
  params: Promise<{
    eventId: string;
    slug: string;
  }>;
};

function createRouteLogger(request: Request) {
  const { requestId } = resolveRequestContext(request.headers);

  return {
    logger: createServerLogger({
      feature: EXCEPTION_ROUTE_LOG.feature,
      operation: EXCEPTION_ROUTE_LOG.operation,
      requestId,
    }),
    requestId,
  };
}

/**
 * "Cancelar esta fecha" / "Mover esta fecha": stores the exception of one
 * date of a series (managers only) and answers with the series slots of the
 * visible month (`?month=`) so the calendar updates without a reload.
 */
export async function PUT(request: Request, context: TribeEventRouteContext) {
  const { logger, requestId } = createRouteLogger(request);
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
      body: tribeEventOccurrenceExceptionBodySchema,
      params: tribeEventRouteParamsSchema,
      query: tribeEventExceptionSaveQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { eventId, slug } = input.params;
  const logMetadata = {
    eventId,
    kind: input.body.kind,
    originalStartsAt: input.body.originalStartsAt,
    slug,
    viewerId: authenticatedMember.id,
  };

  try {
    const result = await modules.events.useCases.saveTribeEventOccurrenceException({
      ...input.body,
      eventId,
      tribeSlug: slug,
      visibleMonth: input.query.month ?? null,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.exceptionSaved) {
      return mapTribeEventExceptionStatusResponse(result.status);
    }

    return createTribeEventPublicResponse({
      body: {
        message:
          input.body.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved
            ? TRIBE_EVENT_ROUTE_RESPONSE.exceptionMovedMessage
            : TRIBE_EVENT_ROUTE_RESPONSE.exceptionCancelledMessage,
        occurrences: result.occurrences,
      },
      failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedExceptionMessage,
      logger,
      metadata: logMetadata,
      schema: tribeEventExceptionResponseSchema,
      status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
    });
  } catch (error) {
    logger.error({
      message: EXCEPTION_ROUTE_LOG.saveFailureMessage,
      error,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedExceptionMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}

/**
 * "Restaurar fecha": removes the exception of `?occurrence=` (original
 * start) and answers with the visible month (`?month=`).
 */
export async function DELETE(request: Request, context: TribeEventRouteContext) {
  const { logger, requestId } = createRouteLogger(request);
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
      query: tribeEventExceptionClearQuerySchema,
    },
  });

  if (!input.isValid) {
    return input.response;
  }

  const { eventId, slug } = input.params;
  const logMetadata = {
    eventId,
    originalStartsAt: input.query.occurrence,
    slug,
    viewerId: authenticatedMember.id,
  };

  try {
    const result = await modules.events.useCases.clearTribeEventOccurrenceException({
      eventId,
      originalStartsAt: input.query.occurrence,
      tribeSlug: slug,
      visibleMonth: input.query.month ?? null,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.exceptionCleared) {
      return mapTribeEventExceptionStatusResponse(result.status);
    }

    return createTribeEventPublicResponse({
      body: {
        message: TRIBE_EVENT_ROUTE_RESPONSE.exceptionClearedMessage,
        occurrences: result.occurrences,
      },
      failureMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedExceptionMessage,
      logger,
      metadata: logMetadata,
      schema: tribeEventExceptionResponseSchema,
      status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
    });
  } catch (error) {
    logger.error({
      message: EXCEPTION_ROUTE_LOG.clearFailureMessage,
      error,
      metadata: logMetadata,
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedExceptionMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
