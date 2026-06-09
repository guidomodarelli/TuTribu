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
  readLessonFilesField,
  readNumberField,
  readStringField,
  readUuidField,
  readUuidValue,
} from "../../route-helpers";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ lessonId: string; slug: string }> }
) {
  const { lessonId, slug } = await context.params;
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

  const targetLessonId = readUuidValue(lessonId);

  if (!targetLessonId) {
    return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
  }

  try {
    const body = await request.json().catch(() => null);
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
      userId: authenticatedMember.id,
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
  } catch (error) {
    logger.error({
      message: COURSE_ROUTE_LOG.updateLessonFailureMessage,
      error,
      metadata: { lessonId, slug, viewerId: authenticatedMember.id },
    });

    return createJsonResponse(
      { message: COURSE_ROUTE_RESPONSE.unexpectedUpdateMessage },
      HTTP_STATUS.serverError
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ lessonId: string; slug: string }> }
) {
  const { lessonId, slug } = await context.params;
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

  const targetLessonId = readUuidValue(lessonId);

  if (!targetLessonId) {
    return mapMutationStatusResponse(COURSE_MUTATION_STATUS.invalidInput);
  }

  try {
    const result = await modules.courses.useCases.deleteLesson({
      lessonId: targetLessonId,
      tribeSlug: slug,
      userId: authenticatedMember.id,
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
      message: COURSE_ROUTE_LOG.deleteLessonFailureMessage,
      error,
      metadata: { lessonId, slug, viewerId: authenticatedMember.id },
    });

    return createJsonResponse(
      { message: COURSE_ROUTE_RESPONSE.unexpectedDeleteMessage },
      HTTP_STATUS.serverError
    );
  }
}
