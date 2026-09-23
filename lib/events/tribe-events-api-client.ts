import { ROUTES } from "@/src/constants/routes";
import type { CreateTribeEventCommand } from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventAttendanceOption,
  TribeEventAttendanceReportResult,
  TribeEventOccurrenceResult,
} from "@/src/modules/events/application/results/tribe-event-result";

/**
 * Browser adapter for the tribe event route handlers. It only knows URLs,
 * HTTP verbs, and response bodies; UI feedback and state belong to callers.
 */

/**
 * Body sent to the create/update event endpoints. Optional fields travel as
 * empty strings so the application layer normalizes them in one place.
 */
export type TribeEventSavePayload = Omit<CreateTribeEventCommand, "tribeSlug" | "visibleMonth">;

/**
 * Outcome of a mutation request. `message` is the safe Spanish copy returned
 * by the route handler, when present.
 */
export type TribeEventRequestResult<TData> =
  | ({ isSuccess: true; message: string | null } & TData)
  | { isSuccess: false; message: string | null };

type SaveEventResponseBody = {
  message?: string;
  occurrences?: TribeEventOccurrenceResult[];
};

type AttendanceResponseBody = {
  attendance?: TribeEventOccurrenceResult["attendance"];
  message?: string;
};

type AttendanceReportResponseBody = {
  message?: string;
  report?: TribeEventAttendanceReportResult;
};

type MessageResponseBody = {
  message?: string;
};

const HTTP_REQUEST = {
  contentTypeHeader: "Content-Type",
  jsonContentType: "application/json",
  methodDelete: "DELETE",
  methodPatch: "PATCH",
  methodPost: "POST",
  methodPut: "PUT",
} as const;
const EVENT_ENDPOINT = {
  attendanceExportPath: "/attendance/export",
  attendancePath: "/attendance",
  eventsPath: "/events",
  monthQuery: "?month=",
  occurrenceQuery: "?occurrence=",
  separator: "/",
} as const;
const JSON_HEADERS = {
  [HTTP_REQUEST.contentTypeHeader]: HTTP_REQUEST.jsonContentType,
} as const;

function buildEventsEndpoint(tribeSlug: string, month?: string): string {
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

/**
 * Reads a JSON body, degrading to an empty object when the response has no
 * parseable body so callers fall back to their own safe copy.
 */
async function readJsonBody<TBody>(response: Response): Promise<TBody> {
  return (await response.json().catch(() => ({}))) as TBody;
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
  const body = await readJsonBody<SaveEventResponseBody>(response);

  if (!response.ok || !body.occurrences) {
    return { isSuccess: false, message: body.message ?? null };
  }

  return { isSuccess: true, message: body.message ?? null, occurrences: body.occurrences };
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
  const body = await readJsonBody<MessageResponseBody>(response);

  return response.ok
    ? { isSuccess: true, message: body.message ?? null }
    : { isSuccess: false, message: body.message ?? null };
}

/**
 * Records (`status`) or clears (`null`) the viewer answer for one occurrence.
 *
 * @param input - Tribe, occurrence, and the answer to store.
 * @returns The fresh attendance summary or the failure message.
 */
export async function saveTribeEventAttendanceRequest(input: {
  occurrence: Pick<TribeEventOccurrenceResult, "eventId" | "startsAt">;
  status: TribeEventAttendanceOption | null;
  tribeSlug: string;
}): Promise<
  TribeEventRequestResult<{ attendance: TribeEventOccurrenceResult["attendance"] }>
> {
  const { occurrence, status, tribeSlug } = input;
  const response = status
    ? await fetch(buildAttendanceEndpoint(tribeSlug, occurrence.eventId), {
        body: JSON.stringify({ occurrenceStartsAt: occurrence.startsAt, status }),
        headers: JSON_HEADERS,
        method: HTTP_REQUEST.methodPut,
      })
    : await fetch(buildAttendanceEndpoint(tribeSlug, occurrence.eventId, occurrence.startsAt), {
        method: HTTP_REQUEST.methodDelete,
      });
  const body = await readJsonBody<AttendanceResponseBody>(response);

  if (!response.ok || !body.attendance) {
    return { isSuccess: false, message: body.message ?? null };
  }

  return { attendance: body.attendance, isSuccess: true, message: body.message ?? null };
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
  const body = await readJsonBody<AttendanceReportResponseBody>(response);

  if (!response.ok || !body.report) {
    return { isSuccess: false, message: body.message ?? null };
  }

  return { isSuccess: true, message: null, report: body.report };
}
