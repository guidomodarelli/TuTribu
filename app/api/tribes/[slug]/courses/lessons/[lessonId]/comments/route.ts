import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import {
  COURSE_ROUTE_FIELD,
  COURSE_ROUTE_LOG,
  COURSE_ROUTE_RESPONSE,
  HTTP_STATUS,
  createJsonResponse,
  readStringField,
  readUuidValue,
} from "../../../route-helpers";

const COMMENT_LIST_STATUS = {
  ok: "ok",
} as const;

const COMMENT_CREATION_STATUS = {
  created: "created",
} as const;

export async function GET(
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
    const result = await modules.courses.useCases.listLessonComments({
      lessonId,
      tribeSlug: slug,
    });

    if (result.status === COMMENT_LIST_STATUS.ok) {
      return createJsonResponse({ comments: result.comments }, HTTP_STATUS.ok);
    }

    if (result.status === COURSE_MUTATION_STATUS.notFound) {
      return createJsonResponse(
        { message: COURSE_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    }

    return createJsonResponse(
      { message: COURSE_ROUTE_RESPONSE.commentForbiddenMessage },
      HTTP_STATUS.forbidden
    );
  } catch (error) {
    logger.error({
      message: COURSE_ROUTE_LOG.listLessonCommentsFailureMessage,
      error,
      metadata: { lessonId: rawLessonId, slug, viewerId: authenticatedMember.id },
    });

    return createJsonResponse(
      { message: COURSE_ROUTE_RESPONSE.unexpectedCommentMessage },
      HTTP_STATUS.serverError
    );
  }
}

export async function POST(
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
    const result = await modules.courses.useCases.createLessonComment({
      content: readStringField(body, COURSE_ROUTE_FIELD.content),
      lessonId,
      tribeSlug: slug,
    });

    if (result.status === COMMENT_CREATION_STATUS.created) {
      return createJsonResponse(
        {
          comment: result.comment,
          message: COURSE_ROUTE_RESPONSE.commentCreatedMessage,
        },
        HTTP_STATUS.created
      );
    }

    if (result.status === COURSE_MUTATION_STATUS.invalidInput) {
      return createJsonResponse(
        { message: COURSE_ROUTE_RESPONSE.invalidCommentMessage },
        HTTP_STATUS.badRequest
      );
    }

    if (result.status === COURSE_MUTATION_STATUS.notFound) {
      return createJsonResponse(
        { message: COURSE_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    }

    return createJsonResponse(
      { message: COURSE_ROUTE_RESPONSE.commentForbiddenMessage },
      HTTP_STATUS.forbidden
    );
  } catch (error) {
    logger.error({
      message: COURSE_ROUTE_LOG.createLessonCommentFailureMessage,
      error,
      metadata: { lessonId: rawLessonId, slug, viewerId: authenticatedMember.id },
    });

    return createJsonResponse(
      { message: COURSE_ROUTE_RESPONSE.unexpectedCommentMessage },
      HTTP_STATUS.serverError
    );
  }
}
