import { COURSE_ENGAGEMENT_STATUS } from "@/src/modules/courses/constants/courses";
import {
  COURSE_ROUTE_FIELD,
  COURSE_ROUTE_LOG,
  COURSE_ROUTE_RESPONSE,
  HTTP_STATUS,
  createCourseNotFoundResponse,
  createJsonResponse,
  mapCourseAccessStatusResponse,
  readBooleanField,
  readCourseRequestBody,
  readUuidValue,
} from "../../../route-helpers";
import { runCourseRoute } from "../../../course-route-scope";

export async function PUT(
  request: Request,
  context: { params: Promise<{ lessonId: string; slug: string }> }
) {
  const { lessonId: rawLessonId, slug } = await context.params;

  return runCourseRoute(
    request,
    {
      logMessage: COURSE_ROUTE_LOG.setLessonCompletionFailureMessage,
      metadata: { lessonId: rawLessonId, slug },
      responseMessage: COURSE_ROUTE_RESPONSE.unexpectedCompletionMessage,
    },
    async ({ modules }) => {
      const lessonId = readUuidValue(rawLessonId);

      if (!lessonId) {
        return createCourseNotFoundResponse();
      }

      const body = await readCourseRequestBody(request);
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

      return mapCourseAccessStatusResponse(
        result.status,
        COURSE_ROUTE_RESPONSE.completionForbiddenMessage
      );
    }
  );
}
