import { createRequestModules } from "@/src/modules/setup";
import {
  TRIBE_STORY_CONTENT_MAX_LENGTH,
  TRIBE_STORY_SAVE_STATUS,
} from "@/src/modules/tribes/constants/tribe-story";
import {
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/application/results/tribe-page-access-result";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import type { TribeStoryResult } from "@/src/modules/tribes/application/results/tribe-story-result";

const STORY_ROUTE_LOG = {
  feature: "tribes",
  getFailureMessage: "Tribe story loading failed",
  operation: "manage-tribe-story",
  saveFailureMessage: "Tribe story save failed",
} as const;

const STORY_ROUTE_RESPONSE = {
  accessForbiddenMessage: "No tenés acceso a esta tribu.",
  contentTooLongMessage: `La historia no puede superar los ${TRIBE_STORY_CONTENT_MAX_LENGTH} caracteres.`,
  forbiddenMessage: "Solo el líder puede editar la historia de la tribu.",
  invalidBodyMessage: "Revisá el contenido de la historia antes de guardar.",
  missingContentMessage: "Escribí la historia antes de guardar.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  savedMessage: "Historia actualizada.",
  unauthorizedMessage: "Iniciá sesión para gestionar la historia.",
  unexpectedGetMessage: "No pudimos cargar la historia. Intentá de nuevo.",
  unexpectedSaveMessage: "No pudimos guardar la historia. Intentá de nuevo.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return Response.json(body, { status });
}

function createHiddenStoryResponse(reason: string): Response {
  if (reason === TRIBE_PAGE_ACCESS_REASON.blockedHidden) {
    return createJsonResponse(
      { message: STORY_ROUTE_RESPONSE.accessForbiddenMessage },
      HTTP_STATUS.forbidden
    );
  }

  return createJsonResponse(
    { message: STORY_ROUTE_RESPONSE.notFoundMessage },
    HTTP_STATUS.notFound
  );
}

function isPayloadObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRequiredText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function serializeStory(story: TribeStoryResult) {
  return {
    content: story.content,
  };
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      slug: string;
    }>;
  }
) {
  const { slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: STORY_ROUTE_LOG.feature,
    operation: STORY_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember =
    await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: STORY_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const accessResult = await modules.tribes.useCases.getTribePageAccess({
      isAuthenticated: true,
      slug,
    });

    if (accessResult.status === TRIBE_PAGE_ACCESS_STATUS.hidden) {
      return createHiddenStoryResponse(accessResult.reason);
    }

    const story = await modules.tribes.useCases.getTribeStory({
      tribeSlug: slug,
    });

    return createJsonResponse(
      { story: story ? serializeStory(story) : null },
      HTTP_STATUS.ok
    );
  } catch (error) {
    logger.error({
      error,
      message: STORY_ROUTE_LOG.getFailureMessage,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: STORY_ROUTE_RESPONSE.unexpectedGetMessage },
      HTTP_STATUS.serverError
    );
  }
}

export async function PUT(
  request: Request,
  context: {
    params: Promise<{
      slug: string;
    }>;
  }
) {
  const { slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: STORY_ROUTE_LOG.feature,
    operation: STORY_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember =
    await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: STORY_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const parsedBody = await request.json().catch(() => ({}));

    if (!isPayloadObject(parsedBody)) {
      return createJsonResponse(
        { message: STORY_ROUTE_RESPONSE.invalidBodyMessage },
        HTTP_STATUS.badRequest
      );
    }

    const content = readRequiredText(parsedBody.content);

    if (!content) {
      return createJsonResponse(
        { message: STORY_ROUTE_RESPONSE.missingContentMessage },
        HTTP_STATUS.badRequest
      );
    }

    if (content.length > TRIBE_STORY_CONTENT_MAX_LENGTH) {
      return createJsonResponse(
        { message: STORY_ROUTE_RESPONSE.contentTooLongMessage },
        HTTP_STATUS.badRequest
      );
    }

    const result = await modules.tribes.useCases.saveTribeStory({
      content,
      tribeSlug: slug,
    });

    switch (result.status) {
      case TRIBE_STORY_SAVE_STATUS.updated:
        return createJsonResponse(
          {
            message: STORY_ROUTE_RESPONSE.savedMessage,
            story: result.story ? serializeStory(result.story) : null,
          },
          HTTP_STATUS.ok
        );
      case TRIBE_STORY_SAVE_STATUS.notFound:
        return createJsonResponse(
          { message: STORY_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case TRIBE_STORY_SAVE_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: STORY_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      error,
      message: STORY_ROUTE_LOG.saveFailureMessage,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: STORY_ROUTE_RESPONSE.unexpectedSaveMessage },
      HTTP_STATUS.serverError
    );
  }
}
