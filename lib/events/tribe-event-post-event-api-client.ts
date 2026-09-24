import { ROUTES } from "@/src/constants/routes";
import {
  lessonConversionResponseSchema,
  lessonConversionTargetsResponseSchema,
  type LessonConversionResponse,
  type LessonConversionTargetsResponse,
} from "@/src/modules/courses/application/results/lesson-event-source-public-dto-schemas";
import type { LessonFromEventRequestBody } from "@/src/modules/courses/infrastructure/api/lesson-event-source-request-schemas";
import {
  tribeEventCommentResponseSchema,
  tribeEventConversationResponseSchema,
  tribeEventPostEventResponseSchema,
  tribeEventPostEventSaveResponseSchema,
  tribeEventReactionResponseSchema,
  type TribeEventComment,
  type TribeEventConversationResponse,
  type TribeEventPostEventView,
} from "@/src/modules/events/application/results/tribe-event-post-event-public-dto-schemas";
import type { TribeEventOccurrenceReaction } from "@/src/modules/events/domain/entities/tribe-event-post-event";
import type { TribeEventPostEventRequestBody } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-post-event-request-schemas";
import {
  TRIBE_EVENT_HTTP_REQUEST,
  TRIBE_EVENT_JSON_HEADERS,
  buildEventsEndpoint,
  readTribeEventResponse,
  type TribeEventRequestResult,
} from "@/lib/events/tribe-events-api-client";

/**
 * Browser adapter of the post-event routes of one occurrence (resources,
 * reaction, conversation) and of the "Convertir en lección" routes. Every
 * body is parsed with its public DTO schema (`safeParse`) before it reaches
 * the UI; an unusable body is a failure without message so callers show
 * their own fallback copy.
 */

const POST_EVENT_ENDPOINT = {
  commentsPath: "/comments",
  courseLessonFromEventPath: "/courses/lessons/from-event",
  courseLessonTargetsPath: "/courses/lesson-targets",
  occurrenceQuery: "?occurrence=",
  postEventPath: "/post-event",
  reactionPath: "/reaction",
  separator: "/",
} as const;

/**
 * A comment that is already gone answers 404; deleting it again is a success.
 */
const HTTP_NOT_FOUND_STATUS = 404;

/**
 * Occurrence addressed by the post-event routes: its series and original
 * start (stable identity).
 */
export type TribeEventOccurrenceTarget = {
  eventId: string;
  originalStartsAt: string;
  tribeSlug: string;
};

function buildEventPath(target: TribeEventOccurrenceTarget, path: string): string {
  return (
    buildEventsEndpoint(target.tribeSlug) + POST_EVENT_ENDPOINT.separator + target.eventId + path
  );
}

function withOccurrence(url: string, originalStartsAt: string): string {
  return url + POST_EVENT_ENDPOINT.occurrenceQuery + encodeURIComponent(originalStartsAt);
}

function buildCoursesPath(tribeSlug: string, path: string): string {
  return ROUTES.api.tribes + POST_EVENT_ENDPOINT.separator + tribeSlug + path;
}

export async function fetchTribeEventPostEventRequest(
  target: TribeEventOccurrenceTarget,
  signal?: AbortSignal
): Promise<TribeEventRequestResult<{ postEvent: TribeEventPostEventView }>> {
  const response = await fetch(
    withOccurrence(buildEventPath(target, POST_EVENT_ENDPOINT.postEventPath), target.originalStartsAt),
    { signal }
  );
  const read = await readTribeEventResponse(response, tribeEventPostEventResponseSchema);

  return read.isUsable
    ? { isSuccess: true, message: null, postEvent: read.dto.postEvent }
    : { isSuccess: false, message: read.message };
}

export async function saveTribeEventPostEventRequest(
  target: TribeEventOccurrenceTarget,
  payload: Omit<TribeEventPostEventRequestBody, "occurrenceStartsAt">
): Promise<TribeEventRequestResult<{ postEvent: TribeEventPostEventView }>> {
  const response = await fetch(buildEventPath(target, POST_EVENT_ENDPOINT.postEventPath), {
    body: JSON.stringify({ ...payload, occurrenceStartsAt: target.originalStartsAt }),
    headers: TRIBE_EVENT_JSON_HEADERS,
    method: TRIBE_EVENT_HTTP_REQUEST.methodPut,
  });
  const read = await readTribeEventResponse(response, tribeEventPostEventSaveResponseSchema);

  return read.isUsable
    ? { isSuccess: true, message: read.dto.message, postEvent: read.dto.postEvent }
    : { isSuccess: false, message: read.message };
}

/**
 * Sets (or with `null` clears) the viewer's reaction and returns the fresh
 * counts.
 */
export async function setTribeEventReactionRequest(
  target: TribeEventOccurrenceTarget,
  reaction: TribeEventOccurrenceReaction | null
): Promise<TribeEventRequestResult<{ reactions: TribeEventPostEventView["reactions"] }>> {
  const endpoint = buildEventPath(target, POST_EVENT_ENDPOINT.reactionPath);
  const response =
    reaction === null
      ? await fetch(withOccurrence(endpoint, target.originalStartsAt), {
          method: TRIBE_EVENT_HTTP_REQUEST.methodDelete,
        })
      : await fetch(endpoint, {
          body: JSON.stringify({ occurrenceStartsAt: target.originalStartsAt, reaction }),
          headers: TRIBE_EVENT_JSON_HEADERS,
          method: TRIBE_EVENT_HTTP_REQUEST.methodPut,
        });
  const read = await readTribeEventResponse(response, tribeEventReactionResponseSchema);

  return read.isUsable
    ? { isSuccess: true, message: null, reactions: read.dto.reactions }
    : { isSuccess: false, message: read.message };
}

export async function fetchTribeEventConversationRequest(
  target: TribeEventOccurrenceTarget,
  signal?: AbortSignal
): Promise<TribeEventRequestResult<TribeEventConversationResponse>> {
  const response = await fetch(
    withOccurrence(buildEventPath(target, POST_EVENT_ENDPOINT.commentsPath), target.originalStartsAt),
    { signal }
  );
  const read = await readTribeEventResponse(response, tribeEventConversationResponseSchema);

  return read.isUsable
    ? { ...read.dto, isSuccess: true, message: null }
    : { isSuccess: false, message: read.message };
}

export async function createTribeEventCommentRequest(
  target: TribeEventOccurrenceTarget,
  content: string
): Promise<TribeEventRequestResult<{ comment: TribeEventComment }>> {
  const response = await fetch(buildEventPath(target, POST_EVENT_ENDPOINT.commentsPath), {
    body: JSON.stringify({ content, occurrenceStartsAt: target.originalStartsAt }),
    headers: TRIBE_EVENT_JSON_HEADERS,
    method: TRIBE_EVENT_HTTP_REQUEST.methodPost,
  });
  const read = await readTribeEventResponse(response, tribeEventCommentResponseSchema);

  return read.isUsable
    ? { comment: read.dto.comment, isSuccess: true, message: read.dto.message }
    : { isSuccess: false, message: read.message };
}

/**
 * Deletes a comment. A 404 means it is already gone, which callers treat as
 * success (`isAlreadyGone`).
 */
export async function deleteTribeEventCommentRequest(input: {
  commentId: string;
  tribeSlug: string;
}): Promise<{ isAlreadyGone: boolean; isSuccess: boolean; message: string | null }> {
  const response = await fetch(
    buildEventsEndpoint(input.tribeSlug) +
      POST_EVENT_ENDPOINT.commentsPath +
      POST_EVENT_ENDPOINT.separator +
      input.commentId,
    { method: TRIBE_EVENT_HTTP_REQUEST.methodDelete }
  );

  if (response.ok || response.status === HTTP_NOT_FOUND_STATUS) {
    return { isAlreadyGone: !response.ok, isSuccess: true, message: null };
  }

  const read = await readTribeEventResponse(response, tribeEventCommentResponseSchema);

  return { isAlreadyGone: false, isSuccess: false, message: read.isUsable ? null : read.message };
}

export async function fetchLessonConversionTargetsRequest(
  tribeSlug: string,
  signal?: AbortSignal
): Promise<TribeEventRequestResult<LessonConversionTargetsResponse>> {
  const response = await fetch(
    buildCoursesPath(tribeSlug, POST_EVENT_ENDPOINT.courseLessonTargetsPath),
    { signal }
  );
  const read = await readTribeEventResponse(response, lessonConversionTargetsResponseSchema);

  return read.isUsable
    ? { ...read.dto, isSuccess: true, message: null }
    : { isSuccess: false, message: read.message };
}

export async function convertRecordingToLessonRequest(
  tribeSlug: string,
  payload: LessonFromEventRequestBody
): Promise<TribeEventRequestResult<LessonConversionResponse>> {
  const response = await fetch(
    buildCoursesPath(tribeSlug, POST_EVENT_ENDPOINT.courseLessonFromEventPath),
    {
      body: JSON.stringify(payload),
      headers: TRIBE_EVENT_JSON_HEADERS,
      method: TRIBE_EVENT_HTTP_REQUEST.methodPost,
    }
  );
  const read = await readTribeEventResponse(response, lessonConversionResponseSchema);

  return read.isUsable
    ? { ...read.dto, isSuccess: true }
    : { isSuccess: false, message: read.message };
}
