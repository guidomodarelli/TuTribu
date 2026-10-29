import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import {
  tribeEventOccurrenceQuerySchema,
  tribeEventRouteParamsSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";
import {
  TRIBE_EVENT_ROUTE_RESPONSE,
  mapTribeEventAttendanceReportStatusResponse,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { buildTribeEventAttendanceCsvFile } from "@/src/modules/events/infrastructure/export/tribe-event-attendance-csv-file";
import {
  createPrivateFileDownloadResponse,
  handleTribeEventRoute,
  openTribeEventScope,
  readEventOccurrenceLogMetadata,
  type TribeEventRouteContext,
} from "../../../tribe-event-route";

const ATTENDANCE_EXPORT_ROUTE_LOG = {
  failureMessage: "Tribe event attendance export failed",
  operation: "tribe-event-attendance-export",
} as const;

/**
 * Downloads the attendance of one occurrence (`occurrence` query param) as a
 * CSV file. Only leaders and guardians of the tribe get the file; the check
 * runs on the server through the same use case as the on-screen list.
 */
export async function GET(request: Request, context: TribeEventRouteContext) {
  return handleTribeEventRoute(
    request,
    context,
    {
      failure: {
        logMessage: ATTENDANCE_EXPORT_ROUTE_LOG.failureMessage,
        responseMessage: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedAttendanceExportMessage,
      },
      openScope: openTribeEventScope(ATTENDANCE_EXPORT_ROUTE_LOG.operation),
      readLogMetadata: readEventOccurrenceLogMetadata("occurrenceStartsAt"),
      schemas: {
        params: tribeEventRouteParamsSchema,
        query: tribeEventOccurrenceQuerySchema,
      },
    },
    async ({ modules, params, query }) => {
      const result = await modules.events.useCases.getTribeEventAttendanceReport({
        eventId: params.eventId,
        occurrenceStartsAt: query.occurrence,
        tribeSlug: params.slug,
      });

      if (result.status !== TRIBE_EVENT_MUTATION_STATUS.found) {
        return mapTribeEventAttendanceReportStatusResponse(result.status);
      }

      return createPrivateFileDownloadResponse(buildTribeEventAttendanceCsvFile(result.report));
    }
  );
}
