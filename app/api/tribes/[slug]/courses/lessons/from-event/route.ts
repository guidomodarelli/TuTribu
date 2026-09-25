import { buildCourseLessonRoute } from "@/lib/courses/course-lesson-route";
import { lessonConversionResponseSchema } from "@/src/modules/courses/application/results/lesson-event-source-public-dto-schemas";
import { LESSON_EVENT_SOURCE_STATUS } from "@/src/modules/courses/constants/courses";
import {
  LESSON_EVENT_SOURCE_HTTP_STATUS,
  LESSON_EVENT_SOURCE_RESPONSE,
  createLessonEventSourceJsonResponse,
  createLessonEventSourcePublicResponse,
  parseLessonEventSourceInput,
} from "@/src/modules/courses/infrastructure/api/lesson-event-source-http";
import {
  lessonEventSourceParamsSchema,
  lessonFromEventBodySchema,
} from "@/src/modules/courses/infrastructure/api/lesson-event-source-request-schemas";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const LESSON_FROM_EVENT_ROUTE_LOG = {
  completedMessage: "Lesson conversion from event recording completed",
  failureMessage: "Lesson conversion from event recording failed",
  feature: "courses",
  operation: "lesson-from-event-recording",
  occurrenceUnavailableMessage:
    "Lesson conversion rejected: the source occurrence is not finished or was cancelled",
  recordingChangedMessage: "Lesson conversion rejected: the recording changed before the commit",
} as const;

/**
 * Source statuses of the events use case that mean the occurrence exists
 * but is not (or no longer) a finished, non-cancelled date.
 */
const UNAVAILABLE_SOURCE_OCCURRENCE_STATUSES: ReadonlySet<string> = new Set([
  TRIBE_EVENT_MUTATION_STATUS.occurrenceCancelled,
  TRIBE_EVENT_MUTATION_STATUS.occurrenceNotFinished,
]);

/**
 * 409 of a source occurrence that is still in progress or was cancelled.
 */
function createOccurrenceUnavailableResponse(): Response {
  return createLessonEventSourceJsonResponse(
    { message: LESSON_EVENT_SOURCE_RESPONSE.occurrenceUnavailableMessage },
    LESSON_EVENT_SOURCE_HTTP_STATUS.conflict
  );
}

/**
 * "Convertir en lección": the route is the composition point of two
 * independent modules. It reads the occurrence recording through the events
 * use case (tribe read access, real finished slot, existing recording) and
 * hands plain values to the courses use case, which applies course
 * permissions and creates the lesson idempotently (one per occurrence and
 * course). An existing lesson answers 200 with `isExisting: true` and its
 * link instead of a duplicate. The two reads are separate transactions, so
 * the courses transaction holds the recording again before committing: a
 * recording replaced or removed in between answers 409 (`recording_changed`)
 * instead of a lesson with the superseded video, and an occurrence that is
 * not (or no longer) finished, or was cancelled, answers 409 before and
 * inside that transaction.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: LESSON_FROM_EVENT_ROUTE_LOG.feature,
    operation: LESSON_FROM_EVENT_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules({ requestId });
  const member = await modules.auth.useCases.getAuthenticatedMember();

  if (!member) {
    return createLessonEventSourceJsonResponse(
      { message: LESSON_EVENT_SOURCE_RESPONSE.unauthorizedMessage },
      LESSON_EVENT_SOURCE_HTTP_STATUS.unauthorized
    );
  }

  const input = await parseLessonEventSourceInput({
    bodySchema: lessonFromEventBodySchema,
    logger,
    params: context.params,
    paramsSchema: lessonEventSourceParamsSchema,
    request,
  });

  if (!input.isValid) {
    return input.response;
  }

  const { slug } = input.params;
  const logMetadata = {
    courseId: input.body.courseId,
    courseModuleId: input.body.courseModuleId,
    eventId: input.body.eventId,
    originalStartsAt: input.body.occurrenceStartsAt,
    slug,
    viewerId: member.id,
  };

  try {
    const source = await modules.events.useCases.getTribeEventRecordingLessonSource({
      eventId: input.body.eventId,
      originalStartsAt: input.body.occurrenceStartsAt,
      tribeSlug: slug,
    });

    if (UNAVAILABLE_SOURCE_OCCURRENCE_STATUSES.has(source.status)) {
      return createOccurrenceUnavailableResponse();
    }

    if (source.status !== TRIBE_EVENT_MUTATION_STATUS.found) {
      return createLessonEventSourceJsonResponse(
        { message: LESSON_EVENT_SOURCE_RESPONSE.notFoundMessage },
        LESSON_EVENT_SOURCE_HTTP_STATUS.notFound
      );
    }

    const result = await modules.courses.useCases.createLessonFromEventRecording({
      courseId: input.body.courseId,
      courseModuleId: input.body.courseModuleId,
      description: input.body.description,
      externalVideoId: source.source.externalVideoId,
      sourceEventId: source.source.eventId,
      sourceOccurrenceStartsAt: source.source.occurrenceStartsAt,
      title: input.body.title,
      tribeSlug: slug,
      videoProvider: source.source.provider,
    });

    switch (result.status) {
      case LESSON_EVENT_SOURCE_STATUS.created:
      case LESSON_EVENT_SOURCE_STATUS.existing: {
        const isExisting = result.status === LESSON_EVENT_SOURCE_STATUS.existing;

        logger.info({
          message: LESSON_FROM_EVENT_ROUTE_LOG.completedMessage,
          metadata: { ...logMetadata, lessonId: result.lesson.id, result: result.status },
        });

        return createLessonEventSourcePublicResponse({
          body: {
            isExisting,
            lesson: {
              courseId: result.lesson.courseId,
              href: buildCourseLessonRoute(slug, result.lesson.courseId, result.lesson.id),
              id: result.lesson.id,
              title: result.lesson.title,
            },
            message: isExisting
              ? LESSON_EVENT_SOURCE_RESPONSE.existingMessage
              : LESSON_EVENT_SOURCE_RESPONSE.createdMessage,
          },
          failureMessage: LESSON_EVENT_SOURCE_RESPONSE.unexpectedConversionMessage,
          logger,
          metadata: logMetadata,
          schema: lessonConversionResponseSchema,
          status: isExisting
            ? LESSON_EVENT_SOURCE_HTTP_STATUS.ok
            : LESSON_EVENT_SOURCE_HTTP_STATUS.created,
        });
      }
      case LESSON_EVENT_SOURCE_STATUS.invalidInput:
        return createLessonEventSourceJsonResponse(
          { message: LESSON_EVENT_SOURCE_RESPONSE.invalidLessonMessage },
          LESSON_EVENT_SOURCE_HTTP_STATUS.badRequest
        );
      case LESSON_EVENT_SOURCE_STATUS.notFound:
        return createLessonEventSourceJsonResponse(
          { message: LESSON_EVENT_SOURCE_RESPONSE.notFoundMessage },
          LESSON_EVENT_SOURCE_HTTP_STATUS.notFound
        );
      case LESSON_EVENT_SOURCE_STATUS.recordingChanged:
        logger.warn({
          message: LESSON_FROM_EVENT_ROUTE_LOG.recordingChangedMessage,
          metadata: { ...logMetadata, result: result.status },
        });

        return createLessonEventSourceJsonResponse(
          { message: LESSON_EVENT_SOURCE_RESPONSE.recordingChangedMessage },
          LESSON_EVENT_SOURCE_HTTP_STATUS.conflict
        );
      case LESSON_EVENT_SOURCE_STATUS.occurrenceUnavailable:
        logger.warn({
          message: LESSON_FROM_EVENT_ROUTE_LOG.occurrenceUnavailableMessage,
          metadata: { ...logMetadata, result: result.status },
        });

        return createOccurrenceUnavailableResponse();
      default:
        return createLessonEventSourceJsonResponse(
          { message: LESSON_EVENT_SOURCE_RESPONSE.forbiddenMessage },
          LESSON_EVENT_SOURCE_HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      error,
      message: LESSON_FROM_EVENT_ROUTE_LOG.failureMessage,
      metadata: logMetadata,
    });

    return createLessonEventSourceJsonResponse(
      { message: LESSON_EVENT_SOURCE_RESPONSE.unexpectedConversionMessage },
      LESSON_EVENT_SOURCE_HTTP_STATUS.serverError
    );
  }
}
