import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import {
  COURSE_ROUTE_FIELD,
  COURSE_ROUTE_LOG,
  COURSE_ROUTE_RESPONSE,
  HTTP_STATUS,
  createJsonResponse,
  mapMutationStatusResponse,
  readCourseRequestBody,
  readLessonFilesField,
  readNumberField,
  readStringField,
  readUuidValue,
} from "../../../route-helpers";
import { runCourseRoute } from "../../../course-route-scope";

export async function POST(
  request: Request,
  context: { params: Promise<{ moduleId: string; slug: string }> }
) {
  const { moduleId, slug } = await context.params;

  return runCourseRoute(
    request,
    {
      logMessage: COURSE_ROUTE_LOG.createLessonFailureMessage,
      metadata: { moduleId, slug },
      responseMessage: COURSE_ROUTE_RESPONSE.unexpectedCreateMessage,
    },
    async ({ member, modules }) => {
      const courseModuleId = readUuidValue(moduleId);

      if (!courseModuleId) {
        return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
      }

      const body = await readCourseRequestBody(request);
      const files = readLessonFilesField(body);

      if (files === null) {
        return createJsonResponse(
          { message: COURSE_ROUTE_RESPONSE.invalidFileMessage },
          HTTP_STATUS.badRequest
        );
      }

      const result = await modules.courses.useCases.createLesson({
        courseModuleId,
        description: readStringField(body, COURSE_ROUTE_FIELD.description),
        externalVideoUrl: readStringField(
          body,
          COURSE_ROUTE_FIELD.externalVideoUrl
        ),
        ...(files !== undefined ? { files } : {}),
        sortOrder: readNumberField(body, COURSE_ROUTE_FIELD.sortOrder),
        title: readStringField(body, COURSE_ROUTE_FIELD.title),
        tribeSlug: slug,
        userId: member.id,
      });

      if (result.status === COURSE_MUTATION_STATUS.created) {
        return createJsonResponse(
          {
            lesson: result.lesson,
            message: COURSE_ROUTE_RESPONSE.createSuccessMessage,
          },
          HTTP_STATUS.created
        );
      }

      return mapMutationStatusResponse(result.status);
    }
  );
}
