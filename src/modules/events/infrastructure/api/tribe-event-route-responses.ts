import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";

/**
 * Shared HTTP wiring for the tribe event route handlers: body readers, safe
 * Spanish responses, and the mapping from use-case statuses to HTTP codes.
 */
export const TRIBE_EVENT_ROUTE_HTTP_STATUS = {
  badRequest: 400,
  created: 201,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

export const TRIBE_EVENT_ROUTE_QUERY_PARAM = {
  month: "month",
  occurrence: "occurrence",
} as const;

export const TRIBE_EVENT_ROUTE_RESPONSE = {
  attendanceClearedMessage: "Respuesta eliminada.",
  attendanceReportForbiddenMessage: "Solo quienes gestionan eventos pueden ver la asistencia.",
  attendanceSavedMessage: "Respuesta guardada.",
  attendanceWaitlistedMessage: "El evento está completo: quedaste en la lista de espera.",
  createSuccessMessage: "Evento creado.",
  deleteSuccessMessage: "Evento eliminado.",
  eventNotFoundMessage: "No pudimos encontrar el evento.",
  forbiddenMessage: "No tenés permisos para gestionar eventos.",
  invalidAttendanceMessage: "Elegí una fecha válida del evento para responder.",
  invalidCapacityMessage: "Ingresá un cupo entre 1 y 10000, o dejalo vacío para no limitarlo.",
  invalidDateMessage: "La fecha de fin debe ser posterior al inicio.",
  invalidInputMessage: "Completá el título y la fecha de inicio del evento.",
  invalidMeetingUrlMessage: "Usá un link digital válido que empiece con http o https.",
  invalidRecurrenceMessage:
    "Elegí una repetición válida y una fecha de fin posterior al inicio.",
  memberForbiddenMessage: "Solo los miembros activos pueden responder a un evento.",
  tribeNotFoundMessage: "No pudimos encontrar la tribu.",
  unauthorizedMessage: "Iniciá sesión para gestionar eventos.",
  unexpectedAttendanceMessage: "No pudimos guardar tu respuesta. Intentá de nuevo.",
  unexpectedAttendanceReportMessage: "No pudimos cargar la asistencia. Intentá de nuevo.",
  unexpectedAttendanceExportMessage: "No pudimos generar el archivo de asistencia.",
  unexpectedCalendarMessage: "No pudimos generar el archivo de calendario.",
  unexpectedCreateMessage: "No pudimos guardar el evento. Intentá de nuevo.",
  unexpectedDeleteMessage: "No pudimos eliminar el evento. Intentá de nuevo.",
  unexpectedListMessage: "No pudimos cargar los eventos. Intentá de nuevo.",
  unexpectedUpdateMessage: "No pudimos actualizar el evento. Intentá de nuevo.",
  updateSuccessMessage: "Evento actualizado.",
} as const;

const TRIBE_EVENT_BODY_FIELD = {
  capacity: "capacity",
  description: "description",
  endsAt: "endsAt",
  meetingUrl: "meetingUrl",
  occurrenceStartsAt: "occurrenceStartsAt",
  recurrenceFrequency: "recurrenceFrequency",
  recurrenceUntil: "recurrenceUntil",
  startsAt: "startsAt",
  status: "status",
  title: "title",
} as const;

export type TribeEventMutationBody = {
  capacity: string;
  description: string;
  endsAt: string;
  meetingUrl: string;
  recurrenceFrequency: string;
  recurrenceUntil: string;
  startsAt: string;
  title: string;
};

export function createJsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return Response.json(body, { status });
}

export function readStringField(body: unknown, field: string): string {
  if (!body || typeof body !== "object" || !(field in body)) {
    return "";
  }

  const value = (body as Record<string, unknown>)[field];

  return typeof value === "string" ? value : "";
}

export function readTribeEventMutationBody(body: unknown): TribeEventMutationBody {
  return {
    capacity: readStringField(body, TRIBE_EVENT_BODY_FIELD.capacity),
    description: readStringField(body, TRIBE_EVENT_BODY_FIELD.description),
    endsAt: readStringField(body, TRIBE_EVENT_BODY_FIELD.endsAt),
    meetingUrl: readStringField(body, TRIBE_EVENT_BODY_FIELD.meetingUrl),
    recurrenceFrequency: readStringField(
      body,
      TRIBE_EVENT_BODY_FIELD.recurrenceFrequency
    ),
    recurrenceUntil: readStringField(body, TRIBE_EVENT_BODY_FIELD.recurrenceUntil),
    startsAt: readStringField(body, TRIBE_EVENT_BODY_FIELD.startsAt),
    title: readStringField(body, TRIBE_EVENT_BODY_FIELD.title),
  };
}

export function readTribeEventAttendanceBody(body: unknown): {
  occurrenceStartsAt: string;
  status: string;
} {
  return {
    occurrenceStartsAt: readStringField(
      body,
      TRIBE_EVENT_BODY_FIELD.occurrenceStartsAt
    ),
    status: readStringField(body, TRIBE_EVENT_BODY_FIELD.status),
  };
}

export function readSearchParam(request: Request, name: string): string | undefined {
  const { searchParams } = new URL(request.url);

  return searchParams.get(name) ?? undefined;
}

/**
 * Maps a failed save/delete status to the matching safe HTTP response.
 */
export function mapTribeEventMutationStatusResponse(status: string): Response {
  switch (status) {
    case TRIBE_EVENT_MUTATION_STATUS.invalidInput:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.invalidInputMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.badRequest
      );
    case TRIBE_EVENT_MUTATION_STATUS.invalidCapacity:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.invalidCapacityMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.badRequest
      );
    case TRIBE_EVENT_MUTATION_STATUS.invalidDate:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.invalidDateMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.badRequest
      );
    case TRIBE_EVENT_MUTATION_STATUS.invalidMeetingUrl:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.invalidMeetingUrlMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.badRequest
      );
    case TRIBE_EVENT_MUTATION_STATUS.invalidRecurrence:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.invalidRecurrenceMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.badRequest
      );
    case TRIBE_EVENT_MUTATION_STATUS.notFound:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.eventNotFoundMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.notFound
      );
    case TRIBE_EVENT_MUTATION_STATUS.forbidden:
    default:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.forbiddenMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.forbidden
      );
  }
}

/**
 * Maps a failed attendance status to the matching safe HTTP response.
 */
export function mapTribeEventAttendanceStatusResponse(status: string): Response {
  switch (status) {
    case TRIBE_EVENT_MUTATION_STATUS.invalidAttendance:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.invalidAttendanceMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.badRequest
      );
    case TRIBE_EVENT_MUTATION_STATUS.notFound:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.eventNotFoundMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.notFound
      );
    case TRIBE_EVENT_MUTATION_STATUS.forbidden:
    default:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.memberForbiddenMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.forbidden
      );
  }
}

/**
 * Maps a failed attendance report status (JSON view or CSV export) to the
 * matching safe HTTP response. Non-managers get 403 even though the UI hides
 * the section: the check is authoritative on the server.
 */
export function mapTribeEventAttendanceReportStatusResponse(status: string): Response {
  switch (status) {
    case TRIBE_EVENT_MUTATION_STATUS.invalidAttendance:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.invalidAttendanceMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.badRequest
      );
    case TRIBE_EVENT_MUTATION_STATUS.notFound:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.eventNotFoundMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.notFound
      );
    case TRIBE_EVENT_MUTATION_STATUS.forbidden:
    default:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.attendanceReportForbiddenMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.forbidden
      );
  }
}
