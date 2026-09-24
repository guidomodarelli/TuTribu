import {
  tribeEventAttendanceStreakDtoSchema,
  tribeEventAttendanceStreakResponseDtoSchema,
} from "@/src/modules/events/infrastructure/api/dto/tribe-event-attendance-streak-dto";
import {
  buildTribeEventApiEndpoint,
  buildTribeEventAttendanceApiEndpoint,
  buildTribeEventAttendanceStreakApiEndpoint,
  buildTribeEventsApiEndpoint,
} from "@/lib/events/tribe-events-routes";
import { TRIBE_EVENT_ATTENDANCE_FAILURE_CODE } from "@/src/modules/events/constants/tribe-events";
import type { CreateTribeEventCommand } from "@/src/modules/events/application/commands/tribe-event-command";
import type {
  TribeEventAttendanceOption,
  TribeEventAttendanceReportResult,
  TribeEventAttendanceStreakResult,
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
  attendanceStreak?: unknown;
  message?: string;
  occurrences?: TribeEventOccurrenceResult[];
};

type DeleteEventResponseBody = {
  attendanceStreak?: unknown;
  message?: string;
};

/**
 * Streak refreshed by a series mutation. Absent means "keep the streak on
 * screen" (the route could not recompute it or the value was unusable);
 * `null` means the viewer no longer has a streak.
 */
export type TribeEventStreakRefresh = {
  attendanceStreak?: TribeEventAttendanceStreakResult | null;
};

type AttendanceResponseBody = {
  attendance?: TribeEventOccurrenceResult["attendance"];
  code?: unknown;
  message?: string;
};

/**
 * Outcome of an attendance request. A rejection carries
 * `isOccurrenceEnded` when the server already considers the occurrence
 * finished, so the UI can close the answers even if its clock lags behind.
 */
export type TribeEventAttendanceRequestResult =
  | {
      attendance: TribeEventOccurrenceResult["attendance"];
      isSuccess: true;
      message: string | null;
    }
  | { isOccurrenceEnded: boolean; isSuccess: false; message: string | null };

type AttendanceReportResponseBody = {
  message?: string;
  report?: TribeEventAttendanceReportResult;
};

const HTTP_REQUEST = {
  contentTypeHeader: "Content-Type",
  jsonContentType: "application/json",
  methodDelete: "DELETE",
  methodPatch: "PATCH",
  methodPost: "POST",
  methodPut: "PUT",
} as const;
const JSON_HEADERS = {
  [HTTP_REQUEST.contentTypeHeader]: HTTP_REQUEST.jsonContentType,
} as const;

/**
 * Guards the public streak DTO of a mutation response: only `null` or an
 * object with non-negative integer counts is applied (extra keys are
 * dropped); anything else is ignored so the UI keeps the streak it shows.
 */
function readStreakRefresh(attendanceStreak: unknown): TribeEventStreakRefresh {
  if (attendanceStreak === null) {
    return { attendanceStreak: null };
  }

  const parsedStreak = tribeEventAttendanceStreakDtoSchema.safeParse(attendanceStreak);

  return parsedStreak.success ? { attendanceStreak: parsedStreak.data } : {};
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
 * @returns The saved occurrences (plus the refreshed viewer streak when the
 * route returns it) or the failure message.
 */
export async function saveTribeEventRequest(input: {
  eventId: string | null;
  month: string;
  payload: TribeEventSavePayload;
  tribeSlug: string;
}): Promise<
  TribeEventRequestResult<{ occurrences: TribeEventOccurrenceResult[] } & TribeEventStreakRefresh>
> {
  const endpoint = input.eventId
    ? buildTribeEventApiEndpoint(input.tribeSlug, input.eventId, input.month)
    : buildTribeEventsApiEndpoint(input.tribeSlug, input.month);
  const response = await fetch(endpoint, {
    body: JSON.stringify(input.payload),
    headers: JSON_HEADERS,
    method: input.eventId ? HTTP_REQUEST.methodPatch : HTTP_REQUEST.methodPost,
  });
  const body = await readJsonBody<SaveEventResponseBody>(response);

  if (!response.ok || !body.occurrences) {
    return { isSuccess: false, message: body.message ?? null };
  }

  return {
    ...readStreakRefresh(body.attendanceStreak),
    isSuccess: true,
    message: body.message ?? null,
    occurrences: body.occurrences,
  };
}

/**
 * Deletes the whole series and its attendance answers.
 *
 * @param input - Tribe and event identifiers.
 * @returns Whether the deletion succeeded, with the route message and the
 * refreshed viewer streak when the route could recompute it.
 */
export async function deleteTribeEventRequest(input: {
  eventId: string;
  tribeSlug: string;
}): Promise<TribeEventRequestResult<TribeEventStreakRefresh>> {
  const response = await fetch(buildTribeEventApiEndpoint(input.tribeSlug, input.eventId), {
    method: HTTP_REQUEST.methodDelete,
  });
  const body = await readJsonBody<DeleteEventResponseBody>(response);

  return response.ok
    ? { ...readStreakRefresh(body.attendanceStreak), isSuccess: true, message: body.message ?? null }
    : { isSuccess: false, message: body.message ?? null };
}

/**
 * Reads the viewer streak again, for example after an occurrence on screen
 * finished. A failed request or an unusable body resolves to an empty
 * refresh, so the caller keeps the streak it already shows.
 *
 * @param input - Tribe slug and an abort signal that cancels a stale read.
 * @returns The refreshed streak (`null` when there is none) or an empty refresh.
 * @throws The fetch rejection (network failure or abort) for the caller to classify.
 */
export async function fetchTribeEventAttendanceStreakRequest(input: {
  signal?: AbortSignal;
  tribeSlug: string;
}): Promise<TribeEventStreakRefresh> {
  const response = await fetch(
    buildTribeEventAttendanceStreakApiEndpoint(input.tribeSlug),
    { cache: "no-store", signal: input.signal }
  );

  if (!response.ok) {
    return {};
  }

  const parsedBody = tribeEventAttendanceStreakResponseDtoSchema.safeParse(
    await readJsonBody<unknown>(response)
  );

  return parsedBody.success ? { attendanceStreak: parsedBody.data.attendanceStreak } : {};
}

/**
 * Records (`status`) or clears (`null`) the viewer answer for one occurrence.
 *
 * @param input - Tribe, occurrence, and the answer to store.
 * @returns The fresh attendance summary, or the failure message and whether
 * the server rejected the answer because the occurrence already ended.
 */
export async function saveTribeEventAttendanceRequest(input: {
  occurrence: Pick<TribeEventOccurrenceResult, "eventId" | "startsAt">;
  status: TribeEventAttendanceOption | null;
  tribeSlug: string;
}): Promise<TribeEventAttendanceRequestResult> {
  const { occurrence, status, tribeSlug } = input;
  const response = status
    ? await fetch(buildTribeEventAttendanceApiEndpoint(tribeSlug, occurrence.eventId), {
        body: JSON.stringify({ occurrenceStartsAt: occurrence.startsAt, status }),
        headers: JSON_HEADERS,
        method: HTTP_REQUEST.methodPut,
      })
    : await fetch(
        buildTribeEventAttendanceApiEndpoint(tribeSlug, occurrence.eventId, occurrence.startsAt),
        { method: HTTP_REQUEST.methodDelete }
      );
  const body = await readJsonBody<AttendanceResponseBody>(response);

  if (!response.ok || !body.attendance) {
    return {
      isOccurrenceEnded:
        !response.ok && body.code === TRIBE_EVENT_ATTENDANCE_FAILURE_CODE.occurrenceEnded,
      isSuccess: false,
      message: body.message ?? null,
    };
  }

  return { attendance: body.attendance, isSuccess: true, message: body.message ?? null };
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
    buildTribeEventAttendanceApiEndpoint(input.tribeSlug, input.eventId, input.occurrenceStartsAt),
    { signal: input.signal }
  );
  const body = await readJsonBody<AttendanceReportResponseBody>(response);

  if (!response.ok || !body.report) {
    return { isSuccess: false, message: body.message ?? null };
  }

  return { isSuccess: true, message: null, report: body.report };
}
