import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import {
  COURSE_ROUTE_FIELD,
  COURSE_ROUTE_LOG,
  COURSE_ROUTE_RESPONSE,
  HTTP_STATUS,
  createCourseNotFoundResponse,
  createJsonResponse,
  mapCourseAccessStatusResponse,
  readCourseRequestBody,
  readStringField,
  readUuidValue,
} from "../../../route-helpers";
import { runCourseRoute } from "../../../course-route-scope";

const COMMENT_LIST_STATUS = {
  ok: "ok",
} as const;

const COMMENT_CREATION_STATUS = {
  created: "created",
} as const;

type LessonCommentsRouteContext = {
  params: Promise<{ lessonId: string; slug: string }>;
};

export async function GET(request: Request, context: LessonCommentsRouteContext) {
  const { lessonId: rawLessonId, slug } = await context.params;

  return runCourseRoute(
    request,
    {
      logMessage: COURSE_ROUTE_LOG.listLessonCommentsFailureMessage,
      metadata: { lessonId: rawLessonId, slug },
      responseMessage: COURSE_ROUTE_RESPONSE.unexpectedCommentMessage,
    },
    async ({ modules }) => {
      const lessonId = readUuidValue(rawLessonId);

      if (!lessonId) {
        return createCourseNotFoundResponse();
      }

      const result = await modules.courses.useCases.listLessonComments({
        lessonId,
        tribeSlug: slug,
      });

      if (result.status === COMMENT_LIST_STATUS.ok) {
        return createJsonResponse({ comments: result.comments }, HTTP_STATUS.ok);
      }

      return mapCourseAccessStatusResponse(
        result.status,
        COURSE_ROUTE_RESPONSE.commentForbiddenMessage
      );
    }
  );
}

export async function POST(request: Request, context: LessonCommentsRouteContext) {
  const { lessonId: rawLessonId, slug } = await context.params;

  return runCourseRoute(
    request,
    {
      logMessage: COURSE_ROUTE_LOG.createLessonCommentFailureMessage,
      metadata: { lessonId: rawLessonId, slug },
      responseMessage: COURSE_ROUTE_RESPONSE.unexpectedCommentMessage,
    },
    async ({ modules }) => {
      const lessonId = readUuidValue(rawLessonId);

      if (!lessonId) {
        return createCourseNotFoundResponse();
      }

      const body = await readCourseRequestBody(request);
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

      return mapCourseAccessStatusResponse(
        result.status,
        COURSE_ROUTE_RESPONSE.commentForbiddenMessage
      );
    }
  );
}
