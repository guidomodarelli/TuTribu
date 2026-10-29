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
  readNumberField,
  readOptionalField,
  readStringField,
  readUuidValue,
} from "../route-helpers";
import { runCourseRoute } from "../course-route-scope";

type CourseRouteContext = { params: Promise<{ courseId: string; slug: string }> };

export async function PATCH(request: Request, context: CourseRouteContext) {
  const { courseId: rawCourseId, slug } = await context.params;

  return runCourseRoute(
    request,
    {
      logMessage: COURSE_ROUTE_LOG.updateCourseFailureMessage,
      metadata: { courseId: rawCourseId, slug },
      responseMessage: COURSE_ROUTE_RESPONSE.unexpectedUpdateMessage,
    },
    async ({ modules }) => {
      const courseId = readUuidValue(rawCourseId);

      if (!courseId) {
        return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
      }

      const body = await readCourseRequestBody(request);
      const isActive = readBooleanField(body, COURSE_ROUTE_FIELD.isActive);

      if (isActive === null) {
        return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
      }

      const result = await modules.courses.useCases.updateCourse({
        courseId,
        accessRequirement: readOptionalField(body, COURSE_ROUTE_FIELD.accessRequirement),
        coverImageUrl: readStringField(body, COURSE_ROUTE_FIELD.coverImageUrl),
        description: readStringField(body, COURSE_ROUTE_FIELD.description),
        isActive,
        sortOrder: readNumberField(body, COURSE_ROUTE_FIELD.sortOrder),
        title: readStringField(body, COURSE_ROUTE_FIELD.title),
        tribeSlug: slug,
      });

      if (result.status === COURSE_MUTATION_STATUS.updated) {
        return createJsonResponse(
          {
            course: result.course,
            message: COURSE_ROUTE_RESPONSE.updateSuccessMessage,
          },
          HTTP_STATUS.ok
        );
      }

      return mapMutationStatusResponse(result.status);
    }
  );
}

export async function DELETE(request: Request, context: CourseRouteContext) {
  const { courseId: rawCourseId, slug } = await context.params;

  return runCourseRoute(
    request,
    {
      logMessage: COURSE_ROUTE_LOG.deleteCourseFailureMessage,
      metadata: { courseId: rawCourseId, slug },
      responseMessage: COURSE_ROUTE_RESPONSE.unexpectedDeleteMessage,
    },
    async ({ modules }) => {
      const courseId = readUuidValue(rawCourseId);

      if (!courseId) {
        return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
      }

      const result = await modules.courses.useCases.deleteCourse({
        courseId,
        tribeSlug: slug,
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
