import {
  COURSE_ROUTE_LOG,
  COURSE_ROUTE_RESPONSE,
  HTTP_STATUS,
  createCourseNotFoundResponse,
  createJsonResponse,
  mapCourseAccessStatusResponse,
  readUuidValue,
} from "../../route-helpers";
import { runCourseRoute } from "../../course-route-scope";

const COMMENT_DELETION_STATUS = {
  deleted: "deleted",
} as const;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ commentId: string; slug: string }> }
) {
  const { commentId: rawCommentId, slug } = await context.params;

  return runCourseRoute(
    request,
    {
      logMessage: COURSE_ROUTE_LOG.deleteLessonCommentFailureMessage,
      metadata: { commentId: rawCommentId, slug },
      responseMessage: COURSE_ROUTE_RESPONSE.unexpectedCommentMessage,
    },
    async ({ modules }) => {
      const commentId = readUuidValue(rawCommentId);

      if (!commentId) {
        return createCourseNotFoundResponse();
      }

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

      return mapCourseAccessStatusResponse(
        result.status,
        COURSE_ROUTE_RESPONSE.commentForbiddenMessage
      );
    }
  );
}
