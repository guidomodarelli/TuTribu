import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import {
  COURSE_ROUTE_FIELD,
  COURSE_ROUTE_LOG,
  COURSE_ROUTE_RESPONSE,
  HTTP_STATUS,
  createJsonResponse,
  mapMutationStatusResponse,
  readCourseRequestBody,
  readNullableNumberField,
  readNumberField,
  readStringField,
  readUuidField,
} from "../route-helpers";
import { runCourseRoute } from "../course-route-scope";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  return runCourseRoute(
    request,
    {
      logMessage: COURSE_ROUTE_LOG.createCourseModuleFailureMessage,
      metadata: { slug },
      responseMessage: COURSE_ROUTE_RESPONSE.unexpectedCreateMessage,
    },
    async ({ modules }) => {
      const body = await readCourseRequestBody(request);
      const courseId = readUuidField(body, COURSE_ROUTE_FIELD.courseId);
      const unlockAfterDays = readNullableNumberField(
        body,
        COURSE_ROUTE_FIELD.unlockAfterDays
      );

      if (!courseId || unlockAfterDays === undefined) {
        return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
      }

      const result = await modules.courses.useCases.createCourseModule({
        courseId,
        sortOrder: readNumberField(body, COURSE_ROUTE_FIELD.sortOrder),
        title: readStringField(body, COURSE_ROUTE_FIELD.title),
        tribeSlug: slug,
        unlockAfterDays,
      });

      if (result.status === COURSE_MUTATION_STATUS.created) {
        return createJsonResponse(
          {
            courseModule: result.courseModule,
            message: COURSE_ROUTE_RESPONSE.createSuccessMessage,
          },
          HTTP_STATUS.created
        );
      }

      return mapMutationStatusResponse(result.status);
    }
  );
}
