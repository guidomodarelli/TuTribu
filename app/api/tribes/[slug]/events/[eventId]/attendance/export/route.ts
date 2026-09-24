import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import {
  TRIBE_EVENT_ROUTE_HTTP_STATUS,
  TRIBE_EVENT_ROUTE_QUERY_PARAM,
  TRIBE_EVENT_ROUTE_RESPONSE,
  createJsonResponse,
  mapTribeEventAttendanceReportStatusResponse,
  readSearchParam,
} from "@/src/modules/events/infrastructure/api/tribe-event-route-responses";
import { buildTribeEventAttendanceCsvFile } from "@/src/modules/events/infrastructure/export/tribe-event-attendance-csv-file";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const ATTENDANCE_EXPORT_ROUTE_LOG = {
  failureMessage: "Tribe event attendance export failed",
  feature: "events",
  operation: "tribe-event-attendance-export",
} as const;
const EXPORT_RESPONSE_HEADER = {
  cacheControl: "Cache-Control",
  contentDisposition: "Content-Disposition",
  contentType: "Content-Type",
} as const;
const EXPORT_RESPONSE_HEADER_VALUE = {
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
 * Downloads the attendance of one occurrence (`occurrence` query param) as a
 * CSV file. Only leaders and guardians of the tribe get the file; the check
 * runs on the server through the same use case as the on-screen list.
 */
export async function GET(request: Request, context: TribeEventRouteContext) {
  const { eventId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: ATTENDANCE_EXPORT_ROUTE_LOG.feature,
    operation: ATTENDANCE_EXPORT_ROUTE_LOG.operation,
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

  const occurrenceStartsAt =
    readSearchParam(request, TRIBE_EVENT_ROUTE_QUERY_PARAM.occurrence) ?? "";

  try {
    const result = await modules.events.useCases.getTribeEventAttendanceReport({
      eventId,
      occurrenceStartsAt,
      tribeSlug: slug,
    });

    if (result.status !== TRIBE_EVENT_MUTATION_STATUS.found) {
      return mapTribeEventAttendanceReportStatusResponse(result.status);
    }

    const csvFile = buildTribeEventAttendanceCsvFile(result.report);

    return new Response(csvFile.content, {
      headers: {
        [EXPORT_RESPONSE_HEADER.cacheControl]: EXPORT_RESPONSE_HEADER_VALUE.noStore,
        [EXPORT_RESPONSE_HEADER.contentDisposition]:
          EXPORT_RESPONSE_HEADER_VALUE.attachmentPrefix +
          csvFile.fileName +
          EXPORT_RESPONSE_HEADER_VALUE.attachmentSuffix,
        [EXPORT_RESPONSE_HEADER.contentType]: csvFile.contentType,
      },
      status: TRIBE_EVENT_ROUTE_HTTP_STATUS.ok,
    });
  } catch (error) {
    logger.error({
      message: ATTENDANCE_EXPORT_ROUTE_LOG.failureMessage,
      error,
      metadata: {
        eventId,
        occurrenceStartsAt,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: TRIBE_EVENT_ROUTE_RESPONSE.unexpectedAttendanceExportMessage },
      TRIBE_EVENT_ROUTE_HTTP_STATUS.serverError
    );
  }
}
