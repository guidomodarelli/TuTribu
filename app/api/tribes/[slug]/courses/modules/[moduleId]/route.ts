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
  readNullableNumberField,
  readNumberField,
  readStringField,
  readUuidValue,
} from "../../route-helpers";
import { runCourseRoute } from "../../course-route-scope";

type CourseModuleRouteContext = {
  params: Promise<{ moduleId: string; slug: string }>;
};

export async function PATCH(request: Request, context: CourseModuleRouteContext) {
  const { moduleId, slug } = await context.params;

  return runCourseRoute(
    request,
    {
      logMessage: COURSE_ROUTE_LOG.updateCourseModuleFailureMessage,
      metadata: { moduleId, slug },
      responseMessage: COURSE_ROUTE_RESPONSE.unexpectedUpdateMessage,
    },
    async ({ modules }) => {
      const courseModuleId = readUuidValue(moduleId);

      if (!courseModuleId) {
        return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
      }

      const body = await readCourseRequestBody(request);
      const isActive = readBooleanField(body, COURSE_ROUTE_FIELD.isActive);
      const unlockAfterDays = readNullableNumberField(
        body,
        COURSE_ROUTE_FIELD.unlockAfterDays
      );

      if (isActive === null || unlockAfterDays === undefined) {
        return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
      }

      const result = await modules.courses.useCases.updateCourseModule({
        courseModuleId,
        isActive,
        sortOrder: readNumberField(body, COURSE_ROUTE_FIELD.sortOrder),
        title: readStringField(body, COURSE_ROUTE_FIELD.title),
        tribeSlug: slug,
        unlockAfterDays,
      });

      if (result.status === COURSE_MUTATION_STATUS.updated) {
        return createJsonResponse(
          {
            courseModule: result.courseModule,
            message: COURSE_ROUTE_RESPONSE.updateSuccessMessage,
          },
          HTTP_STATUS.ok
        );
      }

      return mapMutationStatusResponse(result.status);
    }
  );
}

export async function DELETE(request: Request, context: CourseModuleRouteContext) {
  const { moduleId, slug } = await context.params;

  return runCourseRoute(
    request,
    {
      logMessage: COURSE_ROUTE_LOG.deleteCourseModuleFailureMessage,
      metadata: { moduleId, slug },
      responseMessage: COURSE_ROUTE_RESPONSE.unexpectedDeleteMessage,
    },
    async ({ modules }) => {
      const courseModuleId = readUuidValue(moduleId);

      if (!courseModuleId) {
        return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
      }

      const result = await modules.courses.useCases.deleteCourseModule({
        courseModuleId,
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
