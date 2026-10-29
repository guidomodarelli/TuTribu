import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import {
  COURSE_ROUTE_FIELD,
  COURSE_ROUTE_LOG,
  COURSE_ROUTE_RESPONSE,
  HTTP_STATUS,
  createJsonResponse,
  mapMutationStatusResponse,
  readCourseRequestBody,
  readNumberField,
  readOptionalField,
  readStringField,
} from "./route-helpers";
import { runCourseRoute } from "./course-route-scope";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  return runCourseRoute(
    request,
    {
      logMessage: COURSE_ROUTE_LOG.createCourseFailureMessage,
      metadata: { slug },
      responseMessage: COURSE_ROUTE_RESPONSE.unexpectedCreateMessage,
    },
    async ({ modules }) => {
      const body = await readCourseRequestBody(request);
      const result = await modules.courses.useCases.createCourse({
        accessRequirement: readOptionalField(body, COURSE_ROUTE_FIELD.accessRequirement),
        coverImageUrl: readStringField(body, COURSE_ROUTE_FIELD.coverImageUrl),
        description: readStringField(body, COURSE_ROUTE_FIELD.description),
        sortOrder: readNumberField(body, COURSE_ROUTE_FIELD.sortOrder),
        title: readStringField(body, COURSE_ROUTE_FIELD.title),
        tribeSlug: slug,
      });

      if (result.status === COURSE_MUTATION_STATUS.created) {
        return createJsonResponse(
          {
            course: result.course,
            message: COURSE_ROUTE_RESPONSE.createSuccessMessage,
          },
          HTTP_STATUS.created
        );
      }

      return mapMutationStatusResponse(result.status);
    }
  );
}
