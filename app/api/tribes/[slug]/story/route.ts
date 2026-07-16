import { createRequestModules } from "@/src/modules/setup";
import { parseExternalVideoUrl } from "@/src/modules/shared/domain/value-objects/external-video-url";
import {
  TRIBE_STORY_CONTENT_MAX_LENGTH,
  TRIBE_STORY_MEDIA_MAX_ITEMS,
  TRIBE_STORY_MEDIA_TYPE,
  TRIBE_STORY_SAVE_STATUS,
} from "@/src/modules/tribes/constants/tribe-story";
import {
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/application/results/tribe-page-access-result";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import type { TribeStoryResult } from "@/src/modules/tribes/application/results/tribe-story-result";
import type { SaveTribeStoryMediaItem } from "@/src/modules/tribes/domain/repositories/tribe-story-repository";

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
  invalidImageUrlMessage:
    "Ingresá una URL de imagen válida que empiece con http:// o https://",
  invalidVideoUrlMessage:
    "Ingresá un link de video de YouTube, Vimeo, Wistia o Loom.",
  invalidWebsiteUrlMessage:
    "Ingresá una URL de sitio web válida que empiece con http:// o https://",
  missingContentMessage: "Escribí la historia antes de guardar.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  savedMessage: "Historia actualizada.",
  tooManyMediaItemsMessage: `La galería admite hasta ${TRIBE_STORY_MEDIA_MAX_ITEMS} recursos.`,
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

const STORY_URL_PROTOCOL = {
  http: "http:",
  https: "https:",
} as const;

type MediaValidationResult =
  | { errorMessage: string; ok: false }
  | { media: SaveTribeStoryMediaItem[]; ok: true };

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

function isHttpUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value);

    return (
      parsedUrl.protocol === STORY_URL_PROTOCOL.http ||
      parsedUrl.protocol === STORY_URL_PROTOCOL.https
    );
  } catch {
    return false;
  }
}

function validateMediaItems(value: unknown): MediaValidationResult {
  if (value === undefined) {
    return { media: [], ok: true };
  }

  if (!Array.isArray(value)) {
    return {
      errorMessage: STORY_ROUTE_RESPONSE.invalidBodyMessage,
      ok: false,
    };
  }

  if (value.length > TRIBE_STORY_MEDIA_MAX_ITEMS) {
    return {
      errorMessage: STORY_ROUTE_RESPONSE.tooManyMediaItemsMessage,
      ok: false,
    };
  }

  const media: SaveTribeStoryMediaItem[] = [];

  for (const [mediaIndex, mediaCandidate] of value.entries()) {
    if (!isPayloadObject(mediaCandidate)) {
      return {
        errorMessage: STORY_ROUTE_RESPONSE.invalidBodyMessage,
        ok: false,
      };
    }

    const mediaUrl = readRequiredText(mediaCandidate.url);

    if (mediaCandidate.mediaType === TRIBE_STORY_MEDIA_TYPE.video) {
      if (!mediaUrl) {
        return {
          errorMessage: STORY_ROUTE_RESPONSE.invalidVideoUrlMessage,
          ok: false,
        };
      }

      try {
        const parsedVideo = parseExternalVideoUrl(mediaUrl);

        media.push({
          externalVideoId: parsedVideo.externalId,
          mediaType: TRIBE_STORY_MEDIA_TYPE.video,
          sortOrder: mediaIndex,
          url: null,
          videoProvider: parsedVideo.provider,
        });
      } catch {
        return {
          errorMessage: STORY_ROUTE_RESPONSE.invalidVideoUrlMessage,
          ok: false,
        };
      }

      continue;
    }

    if (mediaCandidate.mediaType === TRIBE_STORY_MEDIA_TYPE.image) {
      if (!mediaUrl || !isHttpUrl(mediaUrl)) {
        return {
          errorMessage: STORY_ROUTE_RESPONSE.invalidImageUrlMessage,
          ok: false,
        };
      }

      media.push({
        externalVideoId: null,
        mediaType: TRIBE_STORY_MEDIA_TYPE.image,
        sortOrder: mediaIndex,
        url: mediaUrl,
        videoProvider: null,
      });

      continue;
    }

    return {
      errorMessage: STORY_ROUTE_RESPONSE.invalidBodyMessage,
      ok: false,
    };
  }

  return { media, ok: true };
}

function serializeStory(story: TribeStoryResult) {
  return {
    content: story.content,
    media: story.media.map((mediaItem) => ({
      externalVideoId: mediaItem.externalVideoId,
      id: mediaItem.id,
      mediaType: mediaItem.mediaType,
      sortOrder: mediaItem.sortOrder,
      url: mediaItem.url,
      videoProvider: mediaItem.videoProvider,
    })),
    websiteUrl: story.websiteUrl,
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

    const websiteUrl = readRequiredText(parsedBody.websiteUrl);

    if (websiteUrl && !isHttpUrl(websiteUrl)) {
      return createJsonResponse(
        { message: STORY_ROUTE_RESPONSE.invalidWebsiteUrlMessage },
        HTTP_STATUS.badRequest
      );
    }

    const mediaValidation = validateMediaItems(parsedBody.media);

    if (!mediaValidation.ok) {
      return createJsonResponse(
        { message: mediaValidation.errorMessage },
        HTTP_STATUS.badRequest
      );
    }

    const result = await modules.tribes.useCases.saveTribeStory({
      content,
      media: mediaValidation.media,
      tribeSlug: slug,
      websiteUrl,
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
