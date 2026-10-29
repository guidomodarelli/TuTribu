import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import {
  COURSE_ROUTE_FIELD,
  COURSE_ROUTE_LOG,
  COURSE_ROUTE_RESPONSE,
  HTTP_STATUS,
  createJsonResponse,
  mapMutationStatusResponse,
  readBooleanField,
  readCourseRequestBody,
  readLessonFilesField,
  readNumberField,
  readStringField,
  readUuidField,
  readUuidValue,
} from "../../route-helpers";
import { runCourseRoute } from "../../course-route-scope";

type LessonRouteContext = { params: Promise<{ lessonId: string; slug: string }> };

export async function PATCH(request: Request, context: LessonRouteContext) {
  const { lessonId, slug } = await context.params;

  return runCourseRoute(
    request,
    {
      logMessage: COURSE_ROUTE_LOG.updateLessonFailureMessage,
      metadata: { lessonId, slug },
      responseMessage: COURSE_ROUTE_RESPONSE.unexpectedUpdateMessage,
    },
    async ({ member, modules }) => {
      const targetLessonId = readUuidValue(lessonId);

      if (!targetLessonId) {
        return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
      }

      const body = await readCourseRequestBody(request);
      const isActive = readBooleanField(body, COURSE_ROUTE_FIELD.isActive);
      const courseModuleId = readUuidField(
        body,
        COURSE_ROUTE_FIELD.courseModuleId
      );

      if (isActive === null || !courseModuleId) {
        return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
      }

      const files = readLessonFilesField(body);

      if (files === null) {
        return createJsonResponse(
          { message: COURSE_ROUTE_RESPONSE.invalidFileMessage },
          HTTP_STATUS.badRequest
        );
      }

      const result = await modules.courses.useCases.updateLesson({
        courseModuleId,
        description: readStringField(body, COURSE_ROUTE_FIELD.description),
        externalVideoUrl: readStringField(
          body,
          COURSE_ROUTE_FIELD.externalVideoUrl
        ),
        ...(files !== undefined ? { files } : {}),
        isActive,
        lessonId: targetLessonId,
        sortOrder: readNumberField(body, COURSE_ROUTE_FIELD.sortOrder),
        title: readStringField(body, COURSE_ROUTE_FIELD.title),
        tribeSlug: slug,
        userId: member.id,
      });

      if (result.status === COURSE_MUTATION_STATUS.updated) {
        return createJsonResponse(
          {
            lesson: result.lesson,
            message: COURSE_ROUTE_RESPONSE.updateSuccessMessage,
          },
          HTTP_STATUS.ok
        );
      }

      return mapMutationStatusResponse(result.status);
    }
  );
}

export async function DELETE(request: Request, context: LessonRouteContext) {
  const { lessonId, slug } = await context.params;

  return runCourseRoute(
    request,
    {
      logMessage: COURSE_ROUTE_LOG.deleteLessonFailureMessage,
      metadata: { lessonId, slug },
      responseMessage: COURSE_ROUTE_RESPONSE.unexpectedDeleteMessage,
    },
    async ({ member, modules }) => {
      const targetLessonId = readUuidValue(lessonId);

      if (!targetLessonId) {
        return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
      }

      const result = await modules.courses.useCases.deleteLesson({
        lessonId: targetLessonId,
        tribeSlug: slug,
        userId: member.id,
      });

      if (result.status === COURSE_MUTATION_STATUS.deleted) {
        return createJsonResponse(
          { message: COURSE_ROUTE_RESPONSE.deleteSuccessMessage },
          HTTP_STATUS.ok
        );
      }

      return mapMutationStatusResponse(result.status);
    }
  );
}
