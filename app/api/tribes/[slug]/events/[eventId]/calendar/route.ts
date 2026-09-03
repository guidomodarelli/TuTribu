import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { buildTribeEventIcsFile } from "@/src/modules/events/infrastructure/calendar/ics-calendar-file";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const CALENDAR_ROUTE_LOG = {
  failureMessage: "Tribe event calendar export failed",
  feature: "events",
  operation: "tribe-event-calendar-export",
} as const;
const CALENDAR_RESPONSE_HEADER = {
  cacheControl: "Cache-Control",
  contentDisposition: "Content-Disposition",
  contentType: "Content-Type",
} as const;
const CALENDAR_RESPONSE_HEADER_VALUE = {
  attachmentPrefix: 'attachment; filename="',
  attachmentSuffix: '"',
  noStore: "private, no-store",
} as const;

type TribeEventRouteContext = {
  params: Promise<{
    eventId: string;
    slug: string;
  }>;
};

/**
 * Downloads the event (or the whole series) as an `.ics` file that any
 * calendar app can import.
 */
export async function GET(request: Request, context: TribeEventRouteContext) {
  const { eventId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: CALENDAR_ROUTE_LOG.feature,
    operation: CALENDAR_ROUTE_LOG.operation,
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
    const event = await modules.events.useCases.getTribeEvent({
      eventId,
      tribeSlug: slug,
    });

    if (!event) {
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.eventNotFoundMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.notFound
      );
    }

    const icsFile = buildTribeEventIcsFile(event);

    return new Response(icsFile.content, {
      headers: {
        [CALENDAR_RESPONSE_HEADER.cacheControl]: CALENDAR_RESPONSE_HEADER_VALUE.noStore,
        [CALENDAR_RESPONSE_HEADER.contentDisposition]:
          CALENDAR_RESPONSE_HEADER_VALUE.attachmentPrefix +
          icsFile.fileName +
          CALENDAR_RESPONSE_HEADER_VALUE.attachmentSuffix,
        [CALENDAR_RESPONSE_HEADER.contentType]: icsFile.contentType,
      },
      status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
    });
  } catch (error) {
    logger.error({
      message: CALENDAR_ROUTE_LOG.failureMessage,
      error,
      metadata: {
        eventId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCalendarMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
