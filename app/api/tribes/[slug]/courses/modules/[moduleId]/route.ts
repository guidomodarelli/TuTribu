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
  readBooleanField,
  readNumberField,
  readStringField,
  readUuidValue,
} from "../../route-helpers";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ moduleId: string; slug: string }> }
) {
  const { moduleId, slug } = await context.params;
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

  const courseModuleId = readUuidValue(moduleId);

  if (!courseModuleId) {
    return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
  }

  try {
    const body = await request.json().catch(() => null);
    const isActive = readBooleanField(body, COURSE_ROUTE_FIELD.isActive);

    if (isActive === null) {
      return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
    }

    const result = await modules.courses.useCases.updateCourseModule({
      courseModuleId,
      isActive,
      sortOrder: readNumberField(body, COURSE_ROUTE_FIELD.sortOrder),
      title: readStringField(body, COURSE_ROUTE_FIELD.title),
      tribeSlug: slug,
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
  } catch (error) {
    logger.error({
      message: COURSE_ROUTE_LOG.updateCourseModuleFailureMessage,
      error,
      metadata: { moduleId, slug, viewerId: authenticatedMember.id },
    });

    return createJsonResponse(
      { message: COURSE_ROUTE_RESPONSE.unexpectedUpdateMessage },
      HTTP_STATUS.serverError
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ moduleId: string; slug: string }> }
) {
  const { moduleId, slug } = await context.params;
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

  const courseModuleId = readUuidValue(moduleId);

  if (!courseModuleId) {
    return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
  }

  try {
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
  } catch (error) {
    logger.error({
      message: COURSE_ROUTE_LOG.deleteCourseModuleFailureMessage,
      error,
      metadata: { moduleId, slug, viewerId: authenticatedMember.id },
    });

    return createJsonResponse(
      { message: COURSE_ROUTE_RESPONSE.unexpectedDeleteMessage },
      HTTP_STATUS.serverError
    );
  }
}
