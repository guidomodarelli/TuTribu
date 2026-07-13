import {
  COURSE_ENGAGEMENT_STATUS,
  COURSE_MUTATION_STATUS,
} from "@/src/modules/courses/constants/courses";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import {
  COURSE_ROUTE_FIELD,
  COURSE_ROUTE_LOG,
  COURSE_ROUTE_RESPONSE,
  HTTP_STATUS,
  createJsonResponse,
  readBooleanField,
  readUuidValue,
} from "../../../route-helpers";

export async function PUT(
  request: Request,
  context: { params: Promise<{ lessonId: string; slug: string }> }
) {
  const { lessonId: rawLessonId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: COURSE_ROUTE_LOG.feature,
    operation: COURSE_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember =
    await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: COURSE_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  const lessonId = readUuidValue(rawLessonId);

  if (!lessonId) {
    return createJsonResponse(
      { message: COURSE_ROUTE_RESPONSE.notFoundMessage },
      HTTP_STATUS.notFound
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const completed = readBooleanField(body, COURSE_ROUTE_FIELD.completed);

    if (completed === null) {
      return createJsonResponse(
        { message: COURSE_ROUTE_RESPONSE.invalidInputMessage },
        HTTP_STATUS.badRequest
      );
    }

    const result = await modules.courses.useCases.setLessonCompletion({
      completed,
      lessonId,
      tribeSlug: slug,
    });

    if (
      result.status === COURSE_ENGAGEMENT_STATUS.completed ||
      result.status === COURSE_ENGAGEMENT_STATUS.uncompleted
    ) {
      return createJsonResponse(
        {
          completed: result.status === COURSE_ENGAGEMENT_STATUS.completed,
          message: COURSE_ROUTE_RESPONSE.completionSavedMessage,
        },
        HTTP_STATUS.ok
      );
    }

    if (result.status === COURSE_MUTATION_STATUS.notFound) {
      return createJsonResponse(
        { message: COURSE_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    }

    return createJsonResponse(
      { message: COURSE_ROUTE_RESPONSE.completionForbiddenMessage },
      HTTP_STATUS.forbidden
    );
  } catch (error) {
    logger.error({
      message: COURSE_ROUTE_LOG.setLessonCompletionFailureMessage,
      error,
      metadata: { lessonId: rawLessonId, slug, viewerId: authenticatedMember.id },
    });

    return createJsonResponse(
      { message: COURSE_ROUTE_RESPONSE.unexpectedCompletionMessage },
      HTTP_STATUS.serverError
    );
  }
}
