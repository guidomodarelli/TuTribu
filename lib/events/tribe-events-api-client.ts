import type { z } from "zod";

import type { TribeEventOccurrenceExceptionSubmission } from "@/lib/events/tribe-event-form-submissions";
import {
  buildTribeEventApiEndpoint,
  buildTribeEventAttendanceApiEndpoint,
  buildTribeEventAttendanceStreakApiEndpoint,
  buildTribeEventExceptionsApiEndpoint,
  buildTribeEventsApiEndpoint,
} from "@/lib/events/tribe-events-routes";
import {
  tribeEventAttendanceReportResponseSchema,
  tribeEventAttendanceResponseSchema,
  tribeEventAttendanceStreakNextRefreshAtSchema,
  tribeEventAttendanceStreakResponseSchema,
  tribeEventDeleteResponseSchema,
  tribeEventExceptionResponseSchema,
  tribeEventFailureResponseSchema,
  tribeEventListResponseSchema,
  tribeEventSaveResponseSchema,
} from "@/src/modules/events/application/results/tribe-event-public-dto-schemas";
import type {
  TribeEventAttendanceOption,
  TribeEventAttendanceReportResult,
  TribeEventAttendanceStreakResult,
  TribeEventOccurrenceResult,
} from "@/src/modules/events/application/results/tribe-event-result";
import {
  TRIBE_EVENT_ATTENDANCE_FAILURE_CODE,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
} from "@/src/modules/events/constants/tribe-events";
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
 * Translates the change chosen in the date exception dialog into the body of
 * `PUT .../exceptions`, adding the original start of the selected date. A
 * cancelled date carries no new schedule.
 *
 * @param submission - Values emitted by the date exception dialog.
 * @param originalStartsAt - Original start of the date being changed.
 * @returns The request body the exceptions route validates.
 */
export function toTribeEventOccurrenceExceptionRequestBody(
  submission: TribeEventOccurrenceExceptionSubmission,
  originalStartsAt: string
): TribeEventOccurrenceExceptionRequestBody {
  if (submission.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled) {
    return { kind: submission.kind, originalStartsAt, reason: submission.reason };
  }

  return {
    kind: submission.kind,
    newEndsAt: submission.newEndsAt,
    newStartsAt: submission.newStartsAt,
    originalStartsAt,
    reason: submission.reason,
  };
}

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
 * not be read, or a success status whose body is not the public DTO. A
 * network failure or timeout never resolves here; the request rejects and
 * callers treat it as ambiguous too.
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
export const TRIBE_EVENT_JSON_HEADERS = {
  [HTTP_REQUEST.contentTypeHeader]: HTTP_REQUEST.jsonContentType,
} as const;
const JSON_HEADERS = TRIBE_EVENT_JSON_HEADERS;
/** Lowest HTTP status of a server error, whose mutation may have committed. */
const HTTP_SERVER_ERROR_MIN_STATUS = 500;

/**
 * Streak part of the streak read body; its next refresh instant is guarded
 * apart so an unusable instant never drops a usable streak.
 */
const tribeEventAttendanceStreakReadSchema = tribeEventAttendanceStreakResponseSchema.pick({
  attendanceStreak: true,
});

/**
 * Occurrence part of the month listing, the only field a month re-read uses.
 */
const tribeEventOccurrencesReadSchema = tribeEventListResponseSchema.pick({ events: true });

export type TribeEventResponseRead<TDto> =
  | { dto: TDto; isUsable: true }
  | {
      code: string | null;
      isBodyReadable: boolean;
      isUsable: false;
      message: string | null;
    };

/**
 * Keeps the "absent means keep the streak on screen" contract: the validated
 * body carries `undefined` when the route omitted the streak or sent an
 * unusable one, and the refresh object then has no `attendanceStreak` key.
 * The next refresh instant follows the same rule, apart from the streak, so
 * an unusable value in one field never drops the other.
 */
function readMutationStreakFragment(dto: {
  attendanceStreak?: TribeEventAttendanceStreakResult | null;
  attendanceStreakNextRefreshAt?: string | null;
}): TribeEventStreakReadResult {
  return {
    ...(dto.attendanceStreak === undefined ? {} : { attendanceStreak: dto.attendanceStreak }),
    ...(dto.attendanceStreakNextRefreshAt === undefined
      ? {}
      : { attendanceStreakNextRefreshAt: dto.attendanceStreakNextRefreshAt }),
  };
}

/**
 * Reads a response body and validates it: the success DTO when the status is
 * OK and the body matches `schema`, otherwise the route's safe message (and
 * stable failure code) when the body is a failure DTO. A missing, non-JSON, or
 * unexpected body yields no message so callers show their own fallback copy.
 * `isBodyReadable` tells whether the body was a JSON object at all, which
 * mutations use to tell a clean rejection from an ambiguous outcome.
 */
export async function readTribeEventResponse<TDto>(
  response: Response,
  schema: z.ZodType<TDto>
): Promise<TribeEventResponseRead<TDto>> {
  const body: unknown = await response.json().catch(() => undefined);

  if (response.ok) {
    const dto = schema.safeParse(body);

    if (dto.success) {
      return { dto: dto.data, isUsable: true };
    }
  }

  const failure = tribeEventFailureResponseSchema.safeParse(body);
  const isFailureDto = !response.ok && failure.success;

  return {
    code: isFailureDto ? (failure.data.code ?? null) : null,
    isBodyReadable: typeof body === "object" && body !== null && !Array.isArray(body),
    isUsable: false,
    message: isFailureDto ? failure.data.message : null,
  };
}

/**
 * Builds the failure of a mutation request. Only a non-success status below
 * 500 with a readable body is a rejection that stored nothing; a 5xx status,
 * an unreadable body, or a success status with an unusable body may hide a
 * committed mutation, so the outcome is ambiguous.
 */
export function buildTribeEventMutationFailure(
  response: Response,
  read: { isBodyReadable: boolean; message: string | null }
): TribeEventMutationFailure {
  const isServerError = response.status >= HTTP_SERVER_ERROR_MIN_STATUS;
  const isRejected = !response.ok && !isServerError && read.isBodyReadable;

  return { isOutcomeAmbiguous: !isRejected, isSuccess: false, message: read.message };
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
  const result = await readTribeEventResponse(response, tribeEventSaveResponseSchema);

  if (!result.isUsable) {
    return buildTribeEventMutationFailure(response, result);
  }

  return {
    ...readMutationStreakFragment(result.dto),
    isSuccess: true,
    message: result.dto.message,
    occurrences: result.dto.occurrences,
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
  const result = await readTribeEventResponse(response, tribeEventDeleteResponseSchema);

  return result.isUsable
    ? {
        ...readMutationStreakFragment(result.dto),
        isSuccess: true,
        message: result.dto.message,
      }
    : buildTribeEventMutationFailure(response, result);
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
  const response = await fetch(buildTribeEventAttendanceStreakApiEndpoint(input.tribeSlug), {
    cache: "no-store",
    signal: input.signal,
  });

  if (!response.ok) {
    return { isSuccess: false };
  }

  const body: unknown = await response.json().catch(() => undefined);
  const parsedStreak = tribeEventAttendanceStreakReadSchema.safeParse(body);

  if (!parsedStreak.success) {
    return { isSuccess: false };
  }

  // The instant is read apart from the streak: an absent or unusable one
  // keeps the streak usable but turns the read into a partial one.
  const { attendanceStreak } = parsedStreak.data;
  const parsedNextRefreshAt = tribeEventAttendanceStreakNextRefreshAtSchema.safeParse(
    (body as { attendanceStreakNextRefreshAt?: unknown }).attendanceStreakNextRefreshAt
  );

  return parsedNextRefreshAt.success
    ? {
        attendanceStreak,
        attendanceStreakNextRefreshAt: parsedNextRefreshAt.data,
        isPartial: false,
        isSuccess: true,
      }
    : { attendanceStreak, isPartial: true, isSuccess: true };
}

/**
 * Reads the occurrences of the visible month again, for example after an
 * edit and an attendance answer overlapped and nothing tells which summary is
 * the committed one. An error status or a body whose occurrences are not the
 * public DTO resolves to a failed read.
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
  const result = await readTribeEventResponse(response, tribeEventOccurrencesReadSchema);

  return result.isUsable
    ? { isSuccess: true, occurrences: result.dto.events }
    : { isSuccess: false };
}

/**
 * Records (`status`) or clears (`null`) the viewer answer for one occurrence,
 * identified by its original start (the stable key of a moved date).
 *
 * @param input - Tribe, occurrence, and the answer to store.
 * @returns The fresh attendance summary, or the failure message, whether the
 * outcome is ambiguous, and whether the server rejected the answer because the
 * occurrence already ended.
 */
export async function saveTribeEventAttendanceRequest(input: {
  occurrence: Pick<TribeEventOccurrenceResult, "eventId" | "originalStartsAt">;
  status: TribeEventAttendanceOption | null;
  tribeSlug: string;
}): Promise<TribeEventAttendanceRequestResult> {
  const { occurrence, status, tribeSlug } = input;
  const response = status
    ? await fetch(buildTribeEventAttendanceApiEndpoint(tribeSlug, occurrence.eventId), {
        body: JSON.stringify({ occurrenceStartsAt: occurrence.originalStartsAt, status }),
        headers: JSON_HEADERS,
        method: HTTP_REQUEST.methodPut,
      })
    : await fetch(
        buildTribeEventAttendanceApiEndpoint(
          tribeSlug,
          occurrence.eventId,
          occurrence.originalStartsAt
        ),
        { method: HTTP_REQUEST.methodDelete }
      );
  const result = await readTribeEventResponse(response, tribeEventAttendanceResponseSchema);

  if (!result.isUsable) {
    return {
      ...buildTribeEventMutationFailure(response, result),
      isOccurrenceEnded: result.code === TRIBE_EVENT_ATTENDANCE_FAILURE_CODE.occurrenceEnded,
    };
  }

  return {
    attendance: result.dto.attendance,
    isSuccess: true,
    message: result.dto.message,
  };
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
 * Sends one date exception request and classifies its outcome like the other
 * mutations: the fresh series slots of the visible month, a clean rejection,
 * or an ambiguous outcome that may have committed.
 */
async function sendTribeEventExceptionRequest(
  endpoint: string,
  init: RequestInit
): Promise<TribeEventMutationResult<{ occurrences: TribeEventOccurrenceResult[] }>> {
  const response = await fetch(endpoint, init);
  const result = await readTribeEventResponse(response, tribeEventExceptionResponseSchema);

  return result.isUsable
    ? { isSuccess: true, message: result.dto.message, occurrences: result.dto.occurrences }
    : buildTribeEventMutationFailure(response, result);
}

/**
 * Cancels or moves one date of a series (`PUT .../exceptions`) and returns
 * the series slots of the visible month.
 *
 * @param input - Tribe, event, visible month, and the requested change.
 * @returns The fresh occurrences of the series, or the failure message and
 * whether the outcome is ambiguous.
 */
export async function saveTribeEventOccurrenceExceptionRequest(input: {
  body: TribeEventOccurrenceExceptionRequestBody;
  eventId: string;
  month: string;
  tribeSlug: string;
}): Promise<TribeEventMutationResult<{ occurrences: TribeEventOccurrenceResult[] }>> {
  return sendTribeEventExceptionRequest(
    buildTribeEventExceptionsApiEndpoint(input.tribeSlug, input.eventId, { month: input.month }),
    {
      body: JSON.stringify(input.body),
      headers: JSON_HEADERS,
      method: HTTP_REQUEST.methodPut,
    }
  );
}

/**
 * Restores one date of a series (`DELETE .../exceptions?occurrence=`) and
 * returns the series slots of the visible month.
 *
 * @param input - Tribe, event, original start of the date, and visible month.
 * @returns The fresh occurrences of the series, or the failure message and
 * whether the outcome is ambiguous.
 */
export async function clearTribeEventOccurrenceExceptionRequest(input: {
  eventId: string;
  month: string;
  originalStartsAt: string;
  tribeSlug: string;
}): Promise<TribeEventMutationResult<{ occurrences: TribeEventOccurrenceResult[] }>> {
  return sendTribeEventExceptionRequest(
    buildTribeEventExceptionsApiEndpoint(input.tribeSlug, input.eventId, {
      month: input.month,
      originalStartsAt: input.originalStartsAt,
    }),
    { method: HTTP_REQUEST.methodDelete }
  );
}
