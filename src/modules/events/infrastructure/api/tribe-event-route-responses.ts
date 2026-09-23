import type { TribeEventMessageResponse } from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import {
  TRIBE_EVENT_MUTATION_STATUS,
  TRIBE_EVENT_PROPOSAL_LIMIT,
} from "@/src/modules/events/constants/tribe-events";

/**
 * Shared HTTP wiring for the tribe event route handlers: safe Spanish
 * responses and the mapping from use-case statuses to HTTP codes. Input
 * validation lives in `tribe-event-route-input.ts`; public DTO validation in
 * `tribe-event-public-response.ts`.
 */
export const TRIBE_EVENT_ROUTE_HTTP_STATUS = {
  badRequest: 400,
  conflict: 409,
  created: 201,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

export const TRIBE_EVENT_ROUTE_RESPONSE = {
  attendanceClearedMessage: "Respuesta eliminada.",
  attendanceReportForbiddenMessage: "Solo quienes gestionan eventos pueden ver la asistencia.",
  attendanceSavedMessage: "Respuesta guardada.",
  attendanceWaitlistedMessage: "El evento está completo: quedaste en la lista de espera.",
  createSuccessMessage: "Evento creado.",
  deleteSuccessMessage: "Evento eliminado.",
  eventNotFoundMessage: "No pudimos encontrar el evento.",
  exceptionCancelledMessage: "Fecha cancelada.",
  exceptionClearedMessage: "Fecha restaurada.",
  exceptionMovedMessage: "Fecha movida.",
  forbiddenMessage: "No tenés permisos para gestionar eventos.",
  invalidAttendanceMessage: "Elegí una fecha válida del evento para responder.",
  invalidCapacityMessage: "Ingresá un cupo entre 1 y 10000, o dejalo vacío para no limitarlo.",
  invalidDateMessage: "La fecha de fin debe ser posterior al inicio.",
  invalidEventTypeMessage: "Elegí un tipo de evento válido.",
  invalidExceptionMessage: "Elegí una fecha válida de un evento que se repite.",
  invalidInputMessage: "Completá el título y la fecha de inicio del evento.",
  invalidMeetingUrlMessage: "Usá un link digital válido que empiece con http o https.",
  invalidMonthMessage: "Elegí un mes válido del calendario.",
  invalidMoveMessage: "Elegí la nueva fecha y hora de inicio de la fecha que movés.",
  invalidProposalMessage: "Completá el título, la fecha y una duración válida de la propuesta.",
  invalidRecurrenceMessage:
    "Elegí una repetición válida y una fecha de fin posterior al inicio.",
  invalidReviewNoteMessage: `La nota puede tener hasta ${TRIBE_EVENT_PROPOSAL_LIMIT.reviewNoteMaxLength} caracteres.`,
  memberForbiddenMessage: "Solo los miembros activos pueden responder a un evento.",
  occurrenceCancelledMessage: "Esta fecha fue cancelada: ya no recibe respuestas.",
  proposalApprovedMessage: "Propuesta aprobada: el evento ya está en el calendario.",
  proposalCreatedMessage: "Propuesta enviada. Quienes gestionan eventos la van a revisar.",
  proposalForbiddenMessage: "Solo los miembros activos pueden proponer encuentros.",
  proposalLimitMessage: `Ya tenés ${TRIBE_EVENT_PROPOSAL_LIMIT.pendingPerMember} propuestas pendientes. Esperá a que las revisen o retirá alguna.`,
  proposalNotFoundMessage: "No pudimos encontrar la propuesta.",
  proposalRejectedMessage: "Propuesta rechazada.",
  proposalResolvedMessage: "Esta propuesta ya fue resuelta.",
  proposalReviewForbiddenMessage: "Solo quienes gestionan eventos pueden revisar propuestas.",
  proposalWithdrawnMessage: "Propuesta retirada.",
  tribeNotFoundMessage: "No pudimos encontrar la tribu.",
  unauthorizedMessage: "Iniciá sesión para gestionar eventos.",
  unexpectedAttendanceMessage: "No pudimos guardar tu respuesta. Intentá de nuevo.",
  unexpectedAttendanceReportMessage: "No pudimos cargar la asistencia. Intentá de nuevo.",
  unexpectedAttendanceExportMessage: "No pudimos generar el archivo de asistencia.",
  unexpectedCalendarMessage: "No pudimos generar el archivo de calendario.",
  unexpectedCreateMessage: "No pudimos guardar el evento. Intentá de nuevo.",
  unexpectedDeleteMessage: "No pudimos eliminar el evento. Intentá de nuevo.",
  unexpectedExceptionMessage: "No pudimos actualizar la fecha. Intentá de nuevo.",
  unexpectedListMessage: "No pudimos cargar los eventos. Intentá de nuevo.",
  unexpectedProposalListMessage: "No pudimos cargar las propuestas. Intentá de nuevo.",
  unexpectedProposalMessage: "No pudimos enviar la propuesta. Intentá de nuevo.",
  unexpectedProposalReviewMessage: "No pudimos actualizar la propuesta. Intentá de nuevo.",
  unexpectedUpdateMessage: "No pudimos actualizar el evento. Intentá de nuevo.",
  updateSuccessMessage: "Evento actualizado.",
} as const;

/**
 * Builds a JSON response whose body is a fixed safe message. Success bodies
 * go through `createTribeEventPublicResponse` instead, which validates them.
 */
export function createJsonResponse(
  body: TribeEventMessageResponse,
  status: number
): Response {
  return Response.json(body, { status });
}

/**
 * Maps a failed save/delete status to the matching safe HTTP response.
 */
export function mapTribeEventMutationStatusResponse(status: string): Response {
  switch (status) {
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
    case TRIBE_EVENT_MUTATION_STATUS.occurrenceCancelled:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.occurrenceCancelledMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.conflict
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

/**
 * Maps a failed cancel, move, or restore status to the matching safe response.
 */
export function mapTribeEventExceptionStatusResponse(status: string): Response {
  switch (status) {
    case TRIBE_EVENT_MUTATION_STATUS.invalidOccurrence:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.invalidExceptionMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.badRequest
      );
    case TRIBE_EVENT_MUTATION_STATUS.invalidDate:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.invalidDateMessage },
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
 * Maps a failed proposal status to the matching safe response. A proposal
 * that is no longer pending (a repeated or concurrent approval, or one the
 * author withdrew) is a 409, so the client drops it from its list.
 *
 * @param status - Failed status of the use case.
 * @param forbiddenMessage - Copy of the 403 for this endpoint (proposing or
 * reviewing).
 * @returns The safe JSON response.
 */
export function mapTribeEventProposalStatusResponse(
  status: string,
  forbiddenMessage: string
): Response {
  switch (status) {
    case TRIBE_EVENT_MUTATION_STATUS.proposalLimitReached:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.proposalLimitMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.conflict
      );
    case TRIBE_EVENT_MUTATION_STATUS.proposalResolved:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.proposalResolvedMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.conflict
      );
    case TRIBE_EVENT_MUTATION_STATUS.invalidDate:
    case TRIBE_EVENT_MUTATION_STATUS.invalidMeetingUrl:
    case TRIBE_EVENT_MUTATION_STATUS.invalidRecurrence:
      return mapTribeEventMutationStatusResponse(status);
    case TRIBE_EVENT_MUTATION_STATUS.notFound:
      return createJsonResponse(
        { message: TRIBE_EVENT_ROUTE_RESPONSE.proposalNotFoundMessage },
        TRIBE_EVENT_ROUTE_HTTP_STATUS.notFound
      );
    case TRIBE_EVENT_MUTATION_STATUS.forbidden:
    default:
      return createJsonResponse({ message: forbiddenMessage }, TRIBE_EVENT_ROUTE_HTTP_STATUS.forbidden);
  }
}
