import type { z } from "zod";

import { ROUTES } from "@/src/constants/routes";
import {
  tribeEventAttendanceReportResponseSchema,
  tribeEventAttendanceResponseSchema,
  tribeEventExceptionResponseSchema,
  tribeEventMessageResponseSchema,
  tribeEventSaveResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import type {
  TribeEventAttendanceOption,
  TribeEventAttendanceReportResult,
  TribeEventOccurrenceResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import type { TribeEventOccurrenceExceptionRequestBody } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-exception-request-schemas";
import type { TribeEventMutationRequestBody } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-request-schemas";

/**
 * Browser adapter for the tribe event route handlers. It only knows URLs,
 * HTTP verbs, and response bodies; UI feedback and state belong to callers.
 * Every body is checked with the public DTO schema before it is returned: a
 * response that does not match is treated as a failure with no message, so
 * callers fall back to their own safe copy.
 */

/**
 * Body sent to the create/update event endpoints (the wire contract validated
 * by the route). Optional fields may travel as empty strings.
 */
export type TribeEventSavePayload = TribeEventMutationRequestBody;

/**
 * Outcome of a mutation request. `message` is the safe Spanish copy returned
 * by the route handler, when present.
 */
export type TribeEventRequestResult<TData> =
  | ({ isSuccess: true; message: string | null } & TData)
  | { isSuccess: false; message: string | null };

const HTTP_REQUEST = {
  contentTypeHeader: "Content-Type",
  jsonContentType: "application/json",
  methodDelete: "DELETE",
  methodPatch: "PATCH",
  methodPost: "POST",
  methodPut: "PUT",
} as const;

/**
 * Method and JSON headers shared by the browser adapters of the events API.
 */
export const TRIBE_EVENT_HTTP_REQUEST = HTTP_REQUEST;
const EVENT_ENDPOINT = {
  attendanceExportPath: "/attendance/export",
  attendancePath: "/attendance",
  eventsPath: "/events",
  exceptionsPath: "/exceptions",
  monthQuery: "?month=",
  monthQueryContinuation: "&month=",
  occurrenceQuery: "?occurrence=",
  separator: "/",
} as const;
export const TRIBE_EVENT_JSON_HEADERS = {
  [HTTP_REQUEST.contentTypeHeader]: HTTP_REQUEST.jsonContentType,
} as const;
const JSON_HEADERS = TRIBE_EVENT_JSON_HEADERS;

/**
 * `/api/tribes/[slug]/events` with an optional `?month=`.
 */
export function buildEventsEndpoint(tribeSlug: string, month?: string): string {
  const base =
    ROUTES.api.tribes + EVENT_ENDPOINT.separator + tribeSlug + EVENT_ENDPOINT.eventsPath;

  return month ? base + EVENT_ENDPOINT.monthQuery + month : base;
}

function buildEventEndpoint(tribeSlug: string, eventId: string, month?: string): string {
  const base = buildEventsEndpoint(tribeSlug) + EVENT_ENDPOINT.separator + eventId;

  return month ? base + EVENT_ENDPOINT.monthQuery + month : base;
}

function buildAttendanceEndpoint(
  tribeSlug: string,
  eventId: string,
  occurrenceStartsAt?: string
): string {
  const base = buildEventEndpoint(tribeSlug, eventId) + EVENT_ENDPOINT.attendancePath;

  return occurrenceStartsAt
    ? base + EVENT_ENDPOINT.occurrenceQuery + encodeURIComponent(occurrenceStartsAt)
    : base;
}

type TribeEventResponseRead<TDto> =
  | { dto: TDto; isUsable: true }
  | { isUsable: false; message: string | null };

/**
 * Reads a response body and validates it: the success DTO when the status is
 * OK and the body matches `schema`, otherwise the route's safe message when
 * the body carries one. A missing, non-JSON, or unexpected body yields no
 * message so callers show their own fallback copy.
 */
export async function readTribeEventResponse<TDto>(
  response: Response,
  schema: z.ZodType<TDto>
): Promise<TribeEventResponseRead<TDto>> {
  const body: unknown = await response.json().catch(() => null);

  if (response.ok) {
    const dto = schema.safeParse(body);

    if (dto.success) {
      return { dto: dto.data, isUsable: true };
    }
  }

  const failure = tribeEventMessageResponseSchema.safeParse(body);

  return {
    isUsable: false,
    message: !response.ok && failure.success ? failure.data.message : null,
  };
}

/**
 * Creates an event, or updates the series when `eventId` is given, and returns
 * the occurrences of the saved event inside the visible `month`.
 *
 * @param input - Tribe, optional event id, visible month, and form payload.
 * @returns The saved occurrences or the failure message.
 */
export async function saveTribeEventRequest(input: {
  eventId: string | null;
  month: string;
  payload: TribeEventSavePayload;
  tribeSlug: string;
}): Promise<TribeEventRequestResult<{ occurrences: TribeEventOccurrenceResult[] }>> {
  const endpoint = input.eventId
    ? buildEventEndpoint(input.tribeSlug, input.eventId, input.month)
    : buildEventsEndpoint(input.tribeSlug, input.month);
  const response = await fetch(endpoint, {
    body: JSON.stringify(input.payload),
    headers: JSON_HEADERS,
    method: input.eventId ? HTTP_REQUEST.methodPatch : HTTP_REQUEST.methodPost,
  });
  const result = await readTribeEventResponse(response, tribeEventSaveResponseSchema);

  if (!result.isUsable) {
    return { isSuccess: false, message: result.message };
  }

  return {
    isSuccess: true,
    message: result.dto.message,
    occurrences: result.dto.occurrences,
  };
}

/**
 * Deletes the whole series and its attendance answers.
 *
 * @param input - Tribe and event identifiers.
 * @returns Whether the deletion succeeded, with the route message.
 */
export async function deleteTribeEventRequest(input: {
  eventId: string;
  tribeSlug: string;
}): Promise<TribeEventRequestResult<Record<never, never>>> {
  const response = await fetch(buildEventEndpoint(input.tribeSlug, input.eventId), {
    method: HTTP_REQUEST.methodDelete,
  });
  const result = await readTribeEventResponse(response, tribeEventMessageResponseSchema);

  return result.isUsable
    ? { isSuccess: true, message: result.dto.message }
    : { isSuccess: false, message: result.message };
}

/**
 * Records (`status`) or clears (`null`) the viewer answer for one occurrence.
 *
 * @param input - Tribe, occurrence, and the answer to store.
 * @returns The fresh attendance summary or the failure message.
 */
export async function saveTribeEventAttendanceRequest(input: {
  occurrence: Pick<TribeEventOccurrenceResult, "eventId" | "originalStartsAt">;
  status: TribeEventAttendanceOption | null;
  tribeSlug: string;
}): Promise<
  TribeEventRequestResult<{ attendance: TribeEventOccurrenceResult["attendance"] }>
> {
  const { occurrence, status, tribeSlug } = input;
  const response = status
    ? await fetch(buildAttendanceEndpoint(tribeSlug, occurrence.eventId), {
        body: JSON.stringify({ occurrenceStartsAt: occurrence.originalStartsAt, status }),
        headers: JSON_HEADERS,
        method: HTTP_REQUEST.methodPut,
      })
    : await fetch(buildAttendanceEndpoint(tribeSlug, occurrence.eventId, occurrence.originalStartsAt), {
        method: HTTP_REQUEST.methodDelete,
      });
  const result = await readTribeEventResponse(response, tribeEventAttendanceResponseSchema);

  if (!result.isUsable) {
    return { isSuccess: false, message: result.message };
  }

  return {
    attendance: result.dto.attendance,
    isSuccess: true,
    message: result.dto.message,
  };
}

/**
 * Same-origin URL of the manager CSV export of one occurrence. The route
 * handler authorizes the download again, so the link is safe to render.
 *
 * @param input - Tribe, event, and occurrence start.
 * @returns Relative URL of the CSV download.
 */
export function buildTribeEventAttendanceExportUrl(input: {
  eventId: string;
  occurrenceStartsAt: string;
  tribeSlug: string;
}): string {
  return (
    buildEventEndpoint(input.tribeSlug, input.eventId) +
    EVENT_ENDPOINT.attendanceExportPath +
    EVENT_ENDPOINT.occurrenceQuery +
    encodeURIComponent(input.occurrenceStartsAt)
  );
}

/**
 * Loads the manager attendance report of one occurrence.
 *
 * @param input - Tribe, event, occurrence start, and an abort signal so a
 * stale request (closed dialog, another occurrence) never updates the UI.
 * @returns The report or the safe failure message of the route.
 */
export async function fetchTribeEventAttendanceReportRequest(input: {
  eventId: string;
  occurrenceStartsAt: string;
  signal?: AbortSignal;
  tribeSlug: string;
}): Promise<TribeEventRequestResult<{ report: TribeEventAttendanceReportResult }>> {
  const response = await fetch(
    buildAttendanceEndpoint(input.tribeSlug, input.eventId, input.occurrenceStartsAt),
    { signal: input.signal }
  );
  const result = await readTribeEventResponse(
    response,
    tribeEventAttendanceReportResponseSchema
  );

  if (!result.isUsable) {
    return { isSuccess: false, message: result.message };
  }

  return { isSuccess: true, message: null, report: result.dto.report };
}

/**
 * Cancels or moves one date of a series (`PUT .../exceptions`) and returns
 * the series slots of the visible month.
 *
 * @param input - Tribe, event, visible month, and the requested change.
 * @returns The fresh occurrences of the series or the failure message.
 */
export async function saveTribeEventOccurrenceExceptionRequest(input: {
  body: TribeEventOccurrenceExceptionRequestBody;
  eventId: string;
  month: string;
  tribeSlug: string;
}): Promise<TribeEventRequestResult<{ occurrences: TribeEventOccurrenceResult[] }>> {
  const response = await fetch(
    buildEventEndpoint(input.tribeSlug, input.eventId) +
      EVENT_ENDPOINT.exceptionsPath +
      EVENT_ENDPOINT.monthQuery +
      input.month,
    {
      body: JSON.stringify(input.body),
      headers: JSON_HEADERS,
      method: HTTP_REQUEST.methodPut,
    }
  );
  const result = await readTribeEventResponse(response, tribeEventExceptionResponseSchema);

  return result.isUsable
    ? { isSuccess: true, message: result.dto.message, occurrences: result.dto.occurrences }
    : { isSuccess: false, message: result.message };
}

/**
 * Restores one date of a series (`DELETE .../exceptions?occurrence=`) and
 * returns the series slots of the visible month.
 *
 * @param input - Tribe, event, original start of the date, and visible month.
 * @returns The fresh occurrences of the series or the failure message.
 */
export async function clearTribeEventOccurrenceExceptionRequest(input: {
  eventId: string;
  month: string;
  originalStartsAt: string;
  tribeSlug: string;
}): Promise<TribeEventRequestResult<{ occurrences: TribeEventOccurrenceResult[] }>> {
  const response = await fetch(
    buildEventEndpoint(input.tribeSlug, input.eventId) +
      EVENT_ENDPOINT.exceptionsPath +
      EVENT_ENDPOINT.occurrenceQuery +
      encodeURIComponent(input.originalStartsAt) +
      EVENT_ENDPOINT.monthQueryContinuation +
      input.month,
    { method: HTTP_REQUEST.methodDelete }
  );
  const result = await readTribeEventResponse(response, tribeEventExceptionResponseSchema);

  return result.isUsable
    ? { isSuccess: true, message: result.dto.message, occurrences: result.dto.occurrences }
    : { isSuccess: false, message: result.message };
}
