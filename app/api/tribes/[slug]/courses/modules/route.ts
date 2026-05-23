import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import {
  COURSE_ROUTE_FIELD,
  COURSE_ROUTE_LOG,
  COURSE_ROUTE_RESPONSE,
  HTTP_STATUS,
  createJsonResponse,
  mapMutationStatusResponse,
  readNumberField,
  readStringField,
} from "../route-helpers";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
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

  try {
    const body = await request.json().catch(() => null);
    const result = await modules.courses.useCases.createCourseModule({
      sortOrder: readNumberField(body, COURSE_ROUTE_FIELD.sortOrder),
      title: readStringField(body, COURSE_ROUTE_FIELD.title),
      tribeSlug: slug,
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
  } catch (error) {
    logger.error({
      message: COURSE_ROUTE_LOG.createCourseModuleFailureMessage,
      error,
      metadata: { slug, viewerId: authenticatedMember.id },
    });

    return createJsonResponse(
      { message: COURSE_ROUTE_RESPONSE.unexpectedCreateMessage },
      HTTP_STATUS.serverError
    );
  }
}
