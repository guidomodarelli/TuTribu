import {
  tribeEventAttendanceStreakDtoSchema,
  tribeEventAttendanceStreakNextRefreshAtDtoSchema,
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
 * Outcome of a request. `message` is the safe Spanish copy returned by the
 * route handler, when present.
 */
export type TribeEventRequestResult<TData> =
  | ({ isSuccess: true; message: string | null } & TData)
  | { isSuccess: false; message: string | null };

/**
 * Failure of a mutation request, classified by what it tells about the
 * persisted state. `isOutcomeAmbiguous: false` means the route rejected the
 * mutation with a non-success status below 500 and a readable JSON body, so
 * nothing was stored. `isOutcomeAmbiguous: true` means the mutation may have
 * committed anyway: the route answered with a 5xx status, a body that could
 * not be read, or a success status whose body is unusable. A network failure
 * or timeout never resolves here; the request rejects and callers treat it as
 * ambiguous too.
 */
export type TribeEventMutationFailure = {
  isOutcomeAmbiguous: boolean;
  isSuccess: false;
  message: string | null;
};

/** Outcome of a mutation request (creation, edit, or deletion). */
export type TribeEventMutationResult<TData> =
  | ({ isSuccess: true; message: string | null } & TData)
  | TribeEventMutationFailure;

type SaveEventResponseBody = {
  attendanceStreak?: unknown;
  attendanceStreakNextRefreshAt?: unknown;
  message?: string;
  occurrences?: TribeEventOccurrenceResult[];
};

type ListEventsResponseBody = {
  events?: unknown;
};

type DeleteEventResponseBody = {
  attendanceStreak?: unknown;
  attendanceStreakNextRefreshAt?: unknown;
  message?: string;
};

/**
 * Streak refreshed by a series mutation or a streak read. Absent means the
 * route could not recompute it or the value was unusable: a read keeps the
 * streak on screen and a mutation makes the calendar read it again; `null`
 * means the viewer no longer has a streak.
 */
export type TribeEventStreakRefresh = {
  attendanceStreak?: TribeEventAttendanceStreakResult | null;
};

/**
 * Streak read by `GET /api/tribes/[slug]/events/attendance-streak`, or
 * refreshed by a series mutation, plus the next instant at which it can
 * change. Absent `attendanceStreakNextRefreshAt` means the route could not
 * compute it (or the value was unusable): a read keeps the instant it already
 * watches and a mutation makes the calendar read it again; `null` means
 * nothing ends inside the upcoming window.
 */
export type TribeEventStreakReadResult = TribeEventStreakRefresh & {
  attendanceStreakNextRefreshAt?: string | null;
};

/**
 * Outcome of a streak read. `isSuccess: false` means the route answered with
 * an error status or a body whose streak is not the public streak DTO, so the
 * caller keeps the streak it shows and may retry; a usable body always carries
 * the streak (`null` when there is none). `isPartial: true` means the body
 * carried the streak but no usable next refresh instant (the route omits it
 * when it cannot compute it): the caller applies the streak and retries the
 * read, because the instant it watches may already have passed.
 */
export type TribeEventStreakReadOutcome =
  | {
      attendanceStreak: TribeEventAttendanceStreakResult | null;
      attendanceStreakNextRefreshAt: string | null;
      isPartial: false;
      isSuccess: true;
    }
  | {
      attendanceStreak: TribeEventAttendanceStreakResult | null;
      isPartial: true;
      isSuccess: true;
    }
  | { isSuccess: false };

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
  | (TribeEventMutationFailure & { isOccurrenceEnded: boolean });

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
/** Lowest HTTP status of a server error, whose mutation may have committed. */
const HTTP_SERVER_ERROR_MIN_STATUS = 500;

/**
 * Streak part of the streak read body; its next refresh instant is guarded
 * apart so an unusable instant never drops a usable streak.
 */
const tribeEventAttendanceStreakReadDtoSchema = tribeEventAttendanceStreakResponseDtoSchema.pick({
  attendanceStreak: true,
});

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
 * Guards the next refresh instant of a mutation response: only an ISO 8601
 * UTC instant or `null` is applied; anything else (or an absent field) is
 * ignored so the UI keeps the instant it already watches. It is read apart
 * from the streak, so an unusable value in one field never drops the other.
 */
function readStreakNextRefresh(
  attendanceStreakNextRefreshAt: unknown
): Pick<TribeEventStreakReadResult, "attendanceStreakNextRefreshAt"> {
  const parsedNextRefreshAt = tribeEventAttendanceStreakNextRefreshAtDtoSchema.safeParse(
    attendanceStreakNextRefreshAt
  );

  return parsedNextRefreshAt.success
    ? { attendanceStreakNextRefreshAt: parsedNextRefreshAt.data }
    : {};
}

/**
 * Reads the streak fragment the series mutations spread into their body.
 */
function readMutationStreakFragment(body: {
  attendanceStreak?: unknown;
  attendanceStreakNextRefreshAt?: unknown;
}): TribeEventStreakReadResult {
  return {
    ...readStreakRefresh(body.attendanceStreak),
    ...readStreakNextRefresh(body.attendanceStreakNextRefreshAt),
  };
}

/**
 * Reads a JSON body, degrading to an empty object when the response has no
 * parseable body so callers fall back to their own safe copy.
 */
async function readJsonBody<TBody>(response: Response): Promise<TBody> {
  return (await response.json().catch(() => ({}))) as TBody;
}

/**
 * Reads the JSON body of a mutation response and tells whether it was
 * readable: a parseable JSON object. Unreadable bodies degrade to an empty
 * object so callers fall back to their own safe copy.
 */
async function readMutationJsonBody<TBody>(
  response: Response
): Promise<{ body: TBody; isReadable: boolean }> {
  const body: unknown = await response.json().catch(() => undefined);
  const isReadable = typeof body === "object" && body !== null && !Array.isArray(body);

  return { body: (isReadable ? body : {}) as TBody, isReadable };
}

/**
 * Builds the failure of a mutation request. Only a non-success status below
 * 500 with a readable body is a rejection that stored nothing; a 5xx status,
 * an unreadable body, or a success status with an unusable body may hide a
 * committed mutation, so the outcome is ambiguous.
 */
function buildMutationFailure(
  response: Response,
  isBodyReadable: boolean,
  message: string | undefined
): TribeEventMutationFailure {
  const isServerError = response.status >= HTTP_SERVER_ERROR_MIN_STATUS;
  const isRejected = !response.ok && !isServerError && isBodyReadable;

  return { isOutcomeAmbiguous: !isRejected, isSuccess: false, message: message ?? null };
}

/**
 * Creates an event, or updates the series when `eventId` is given, and returns
 * the occurrences of the saved event inside the visible `month`.
 *
 * @param input - Tribe, optional event id, visible month, and form payload.
 * @returns The saved occurrences (plus the refreshed viewer streak and its
 * next refresh instant when the route returns them) or the failure message
 * and whether the outcome is ambiguous.
 */
export async function saveTribeEventRequest(input: {
  eventId: string | null;
  month: string;
  payload: TribeEventSavePayload;
  tribeSlug: string;
}): Promise<
  TribeEventMutationResult<
    { occurrences: TribeEventOccurrenceResult[] } & TribeEventStreakReadResult
  >
> {
  const endpoint = input.eventId
    ? buildTribeEventApiEndpoint(input.tribeSlug, input.eventId, input.month)
    : buildTribeEventsApiEndpoint(input.tribeSlug, input.month);
  const response = await fetch(endpoint, {
    body: JSON.stringify(input.payload),
    headers: JSON_HEADERS,
    method: input.eventId ? HTTP_REQUEST.methodPatch : HTTP_REQUEST.methodPost,
  });
  const { body, isReadable } = await readMutationJsonBody<SaveEventResponseBody>(response);

  if (!response.ok || !body.occurrences) {
    return buildMutationFailure(response, isReadable, body.message);
  }

  return {
    ...readMutationStreakFragment(body),
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
 * refreshed viewer streak and next refresh instant when the route could
 * recompute them, or the failure message and whether the outcome is ambiguous.
 */
export async function deleteTribeEventRequest(input: {
  eventId: string;
  tribeSlug: string;
}): Promise<TribeEventMutationResult<TribeEventStreakReadResult>> {
  const response = await fetch(buildTribeEventApiEndpoint(input.tribeSlug, input.eventId), {
    method: HTTP_REQUEST.methodDelete,
  });
  const { body, isReadable } = await readMutationJsonBody<DeleteEventResponseBody>(response);

  return response.ok
    ? { ...readMutationStreakFragment(body), isSuccess: true, message: body.message ?? null }
    : buildMutationFailure(response, isReadable, body.message);
}

/**
 * Reads the viewer streak again, for example after an occurrence on screen
 * finished. An error status or an unusable body resolves to a failed read, so
 * the caller can tell it apart from a successful one and retry it.
 *
 * @param input - Tribe slug and an abort signal that cancels a stale read.
 * @returns The refreshed streak (`null` when there is none) and the next
 * refresh instant, a partial read when the instant is absent or unusable, or
 * a failed read.
 * @throws The fetch rejection (network failure or abort) for the caller to classify.
 */
export async function fetchTribeEventAttendanceStreakRequest(input: {
  signal?: AbortSignal;
  tribeSlug: string;
}): Promise<TribeEventStreakReadOutcome> {
  const response = await fetch(
    buildTribeEventAttendanceStreakApiEndpoint(input.tribeSlug),
    { cache: "no-store", signal: input.signal }
  );

  if (!response.ok) {
    return { isSuccess: false };
  }

  const body = await readJsonBody<unknown>(response);
  const parsedStreak = tribeEventAttendanceStreakReadDtoSchema.safeParse(body);

  if (!parsedStreak.success) {
    return { isSuccess: false };
  }

  // The instant is read apart from the streak: an absent or unusable one
  // keeps the streak usable but turns the read into a partial one.
  const { attendanceStreak } = parsedStreak.data;
  const { attendanceStreakNextRefreshAt } = readStreakNextRefresh(
    (body as { attendanceStreakNextRefreshAt?: unknown }).attendanceStreakNextRefreshAt
  );

  return attendanceStreakNextRefreshAt === undefined
    ? { attendanceStreak, isPartial: true, isSuccess: true }
    : { attendanceStreak, attendanceStreakNextRefreshAt, isPartial: false, isSuccess: true };
}

/**
 * Reads the occurrences of the visible month again, for example after an
 * edit and an attendance answer overlapped and nothing tells which summary is
 * the committed one. An error status or a body without an occurrence list
 * resolves to a failed read.
 *
 * @param input - Tribe slug, visible `YYYY-MM` month, and an abort signal that
 * cancels a stale read.
 * @returns The month occurrences, or a failed read.
 * @throws The fetch rejection (network failure or abort) for the caller to classify.
 */
export async function fetchTribeEventOccurrencesRequest(input: {
  month: string;
  signal?: AbortSignal;
  tribeSlug: string;
}): Promise<
  { isSuccess: true; occurrences: TribeEventOccurrenceResult[] } | { isSuccess: false }
> {
  const response = await fetch(buildTribeEventsApiEndpoint(input.tribeSlug, input.month), {
    cache: "no-store",
    signal: input.signal,
  });

  if (!response.ok) {
    return { isSuccess: false };
  }

  const body = await readJsonBody<ListEventsResponseBody>(response);

  return Array.isArray(body.events)
    ? { isSuccess: true, occurrences: body.events as TribeEventOccurrenceResult[] }
    : { isSuccess: false };
}

/**
 * Records (`status`) or clears (`null`) the viewer answer for one occurrence.
 *
 * @param input - Tribe, occurrence, and the answer to store.
 * @returns The fresh attendance summary, or the failure message, whether the
 * outcome is ambiguous, and whether the server rejected the answer because the
 * occurrence already ended.
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
  const { body, isReadable } = await readMutationJsonBody<AttendanceResponseBody>(response);

  if (!response.ok || !body.attendance) {
    return {
      ...buildMutationFailure(response, isReadable, body.message),
      isOccurrenceEnded:
        !response.ok && body.code === TRIBE_EVENT_ATTENDANCE_FAILURE_CODE.occurrenceEnded,
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
