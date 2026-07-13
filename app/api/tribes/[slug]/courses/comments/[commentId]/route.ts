import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import {
  COURSE_ROUTE_LOG,
  COURSE_ROUTE_RESPONSE,
  HTTP_STATUS,
  createJsonResponse,
  readUuidValue,
} from "../../route-helpers";

const COMMENT_DELETION_STATUS = {
  deleted: "deleted",
} as const;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ commentId: string; slug: string }> }
) {
  const { commentId: rawCommentId, slug } = await context.params;
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

  const commentId = readUuidValue(rawCommentId);

  if (!commentId) {
    return createJsonResponse(
      { message: COURSE_ROUTE_RESPONSE.notFoundMessage },
      HTTP_STATUS.notFound
    );
  }

  try {
    const result = await modules.courses.useCases.deleteLessonComment({
      commentId,
      tribeSlug: slug,
    });

    if (result.status === COMMENT_DELETION_STATUS.deleted) {
      return createJsonResponse(
        { message: COURSE_ROUTE_RESPONSE.commentDeletedMessage },
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
      { message: COURSE_ROUTE_RESPONSE.commentForbiddenMessage },
      HTTP_STATUS.forbidden
    );
  } catch (error) {
    logger.error({
      message: COURSE_ROUTE_LOG.deleteLessonCommentFailureMessage,
      error,
      metadata: { commentId: rawCommentId, slug, viewerId: authenticatedMember.id },
    });

    return createJsonResponse(
      { message: COURSE_ROUTE_RESPONSE.unexpectedCommentMessage },
      HTTP_STATUS.serverError
    );
  }
}
