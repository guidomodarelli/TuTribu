import { openLessonEventSourceRouteScope } from "@/app/api/tribes/[slug]/courses/lesson-event-source-route-scope";
import { lessonConversionTargetsResponseSchema } from "@/src/modules/courses/application/results/lesson-event-source-public-dto-schemas";
import { LESSON_EVENT_SOURCE_STATUS } from "@/src/modules/courses/constants/courses";
import {
  LESSON_EVENT_SOURCE_HTTP_STATUS,
  LESSON_EVENT_SOURCE_RESPONSE,
  createLessonEventSourceJsonResponse,
  createLessonEventSourcePublicResponse,
  parseLessonEventSourceInput,
} from "@/src/modules/courses/infrastructure/api/lesson-event-source-http";
import { lessonEventSourceParamsSchema } from "@/src/modules/courses/infrastructure/api/lesson-event-source-request-schemas";

const LESSON_TARGETS_ROUTE_LOG = {
  failureMessage: "Lesson conversion targets load failed",
  operation: "lesson-from-event-recording",
} as const;

/**
 * Courses and modules of the tribe where "Convertir en lección" can put the
 * lesson. Course managers only (403 for everyone else).
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const scope = await openLessonEventSourceRouteScope(request, {
    operation: LESSON_TARGETS_ROUTE_LOG.operation,
    unexpectedFailureMessage: LESSON_EVENT_SOURCE_RESPONSE.unexpectedTargetsMessage,
  });

  if (!scope.isOpen) {
    return scope.response;
  }

  const { logger, member, modules } = scope;

  const input = await parseLessonEventSourceInput({
    logger,
    params: context.params,
    paramsSchema: lessonEventSourceParamsSchema,
    request,
  });

  if (!input.isValid) {
    return input.response;
  }

  const logMetadata = { slug: input.params.slug, viewerId: member.id };

  try {
    const result = await modules.courses.useCases.listLessonConversionTargets({
      tribeSlug: input.params.slug,
    });

    if (result.status === LESSON_EVENT_SOURCE_STATUS.found) {
      return createLessonEventSourcePublicResponse({
        body: { courses: result.courses },
        failureMessage: LESSON_EVENT_SOURCE_RESPONSE.unexpectedTargetsMessage,
        logger,
        metadata: logMetadata,
        schema: lessonConversionTargetsResponseSchema,
        status: LESSON_EVENT_SOURCE_HTTP_STATUS.ok,
      });
    }

    return result.status === LESSON_EVENT_SOURCE_STATUS.notFound
      ? createLessonEventSourceJsonResponse(
          { message: LESSON_EVENT_SOURCE_RESPONSE.notFoundMessage },
          LESSON_EVENT_SOURCE_HTTP_STATUS.notFound
        )
      : createLessonEventSourceJsonResponse(
          { message: LESSON_EVENT_SOURCE_RESPONSE.forbiddenMessage },
          LESSON_EVENT_SOURCE_HTTP_STATUS.forbidden
        );
  } catch (error) {
    logger.error({
      error,
      message: LESSON_TARGETS_ROUTE_LOG.failureMessage,
      metadata: logMetadata,
    });

    return createLessonEventSourceJsonResponse(
      { message: LESSON_EVENT_SOURCE_RESPONSE.unexpectedTargetsMessage },
      LESSON_EVENT_SOURCE_HTTP_STATUS.serverError
    );
  }
}
