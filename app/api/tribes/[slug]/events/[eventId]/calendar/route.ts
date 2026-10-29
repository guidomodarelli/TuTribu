import {
  tribeEventEmptyQuerySchema,
  tribeEventRouteParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { buildTribeEventIcsFile } from "@/src/modules/events/infrastructure/calendar/ics-calendar-file";
import {
  createPrivateFileDownloadResponse,
  handleTribeEventRoute,
  openTribeEventScope,
  type TribeEventRouteContext,
} from "../../tribe-event-route";

const CALENDAR_ROUTE_LOG = {
  failureMessage: "Tribe event calendar export failed",
  operation: "tribe-event-calendar-export",
} as const;

/**
 * Downloads the event (or the whole series, with its cancelled and moved
 * dates) as an `.ics` file that any calendar app can import.
 */
export async function GET(request: Request, context: TribeEventRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: CALENDAR_ROUTE_LOG.failureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedCalendarMessage,
      },
      openScope: openTribeEventScope(CALENDAR_ROUTE_LOG.operation),
      readLogMetadata: ({ params }) => ({ eventId: params.eventId, slug: params.slug }),
      schemas: {
        params: tribeEventRouteParamsSchema,
        query: tribeEventEmptyQuerySchema,
      },
    },
    async ({ modules, params }) => {
      const calendar = await modules.events.useCases.getTribeEventCalendar({
        eventId: params.eventId,
        tribeSlug: params.slug,
      });

      if (!calendar) {
        return createJsonResponse(
          { message: TRIBE_EVENT_ROUTE_RESPONSE.eventNotFoundMessage },
          TRIBE_EVENT_ROUTE_HTTP_STATUS.notFound
        );
      }

      return createPrivateFileDownloadResponse(
        buildTribeEventIcsFile(calendar.event, new Date(), calendar.occurrenceExceptions)
      );
    }
  );
}
