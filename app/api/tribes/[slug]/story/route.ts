import { parseExternalVideoUrl } from "@/src/modules/shared/domain/value-objects/external-video-url";
import { revalidateTribeStoryAboutCache } from "@/src/modules/tribes/infrastructure/cache/tribe-story-about-cache-revalidation";
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
import type { TribeStoryResult } from "@/src/modules/tribes/application/results/tribe-story-result";
import type { SaveTribeStoryMediaItem } from "@/src/modules/tribes/domain/repositories/tribe-story-repository";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type RequestModules,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";
import { isHttpUrl, isPayloadObject, readTrimmedText } from "@/app/api/request-body-fields";

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

type MediaValidationResult =
  | { errorMessage: string; ok: false }
  | { media: SaveTribeStoryMediaItem[]; ok: true };

function createHiddenStoryResponse(reason: string): Response {
  if (reason === TRIBE_PAGE_ACCESS_REASON.blockedHidden) {
    return createRouteJsonResponse(
      { message: STORY_ROUTE_RESPONSE.accessForbiddenMessage },
      HTTP_STATUS.forbidden
    );
  }

  return createRouteJsonResponse(
    { message: STORY_ROUTE_RESPONSE.notFoundMessage },
    HTTP_STATUS.notFound
  );
}

type StoryMediaItemRead = { errorMessage: string } | { item: SaveTribeStoryMediaItem };

function readStoryVideoItem(mediaUrl: string | null, sortOrder: number): StoryMediaItemRead {
  if (!mediaUrl) {
    return { errorMessage: STORY_ROUTE_RESPONSE.invalidVideoUrlMessage };
  }

  try {
    const parsedVideo = parseExternalVideoUrl(mediaUrl);

    return {
      item: {
        externalVideoId: parsedVideo.externalId,
        mediaType: TRIBE_STORY_MEDIA_TYPE.video,
        sortOrder,
        url: null,
        videoProvider: parsedVideo.provider,
      },
    };
  } catch {
    return { errorMessage: STORY_ROUTE_RESPONSE.invalidVideoUrlMessage };
  }
}

function readStoryMediaItem(mediaCandidate: unknown, sortOrder: number): StoryMediaItemRead {
  if (!isPayloadObject(mediaCandidate)) {
    return { errorMessage: STORY_ROUTE_RESPONSE.invalidBodyMessage };
  }

  const mediaUrl = readTrimmedText(mediaCandidate.url);

  if (mediaCandidate.mediaType === TRIBE_STORY_MEDIA_TYPE.video) {
    return readStoryVideoItem(mediaUrl, sortOrder);
  }

  if (mediaCandidate.mediaType === TRIBE_STORY_MEDIA_TYPE.image) {
    if (!mediaUrl || !isHttpUrl(mediaUrl)) {
      return { errorMessage: STORY_ROUTE_RESPONSE.invalidImageUrlMessage };
    }

    return {
      item: {
        externalVideoId: null,
        mediaType: TRIBE_STORY_MEDIA_TYPE.image,
        sortOrder,
        url: mediaUrl,
        videoProvider: null,
      },
    };
  }

  return { errorMessage: STORY_ROUTE_RESPONSE.invalidBodyMessage };
}

type StoryDraft = {
  content: string;
  media: SaveTribeStoryMediaItem[];
  websiteUrl: string | null;
};

/**
 * Validates the story body in the order the route reports its errors.
 *
 * @param parsedBody - Untrusted JSON body.
 * @returns The story to save, or the first validation message.
 */
function readStoryDraft(parsedBody: unknown): StoryDraft | { errorMessage: string } {
  if (!isPayloadObject(parsedBody)) {
    return { errorMessage: STORY_ROUTE_RESPONSE.invalidBodyMessage };
  }

  const content = readTrimmedText(parsedBody.content);

  if (!content) {
    return { errorMessage: STORY_ROUTE_RESPONSE.missingContentMessage };
  }

  if (content.length > TRIBE_STORY_CONTENT_MAX_LENGTH) {
    return { errorMessage: STORY_ROUTE_RESPONSE.contentTooLongMessage };
  }

  const websiteUrl = readTrimmedText(parsedBody.websiteUrl);

  if (websiteUrl && !isHttpUrl(websiteUrl)) {
    return { errorMessage: STORY_ROUTE_RESPONSE.invalidWebsiteUrlMessage };
  }

  const mediaValidation = validateMediaItems(parsedBody.media);

  if (!mediaValidation.ok) {
    return { errorMessage: mediaValidation.errorMessage };
  }

  return { content, media: mediaValidation.media, websiteUrl };
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
    const read = readStoryMediaItem(mediaCandidate, mediaIndex);

    if ("errorMessage" in read) {
      return { errorMessage: read.errorMessage, ok: false };
    }

    media.push(read.item);
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

const MEMBER_ROUTE_SCOPE = {
  feature: STORY_ROUTE_LOG.feature,
  operation: STORY_ROUTE_LOG.operation,
  unauthorizedMessage: STORY_ROUTE_RESPONSE.unauthorizedMessage,
} as const;

export async function GET(
  request: Request,
  context: TribeRouteContext
) {
  const { slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: STORY_ROUTE_LOG.getFailureMessage,
      metadata: { slug },
      responseMessage: STORY_ROUTE_RESPONSE.unexpectedGetMessage,
    },
    async ({ modules }) => {
      const accessResult = await modules.tribes.useCases.getTribePageAccess({
        allowWithoutCommunityAccess: true,
        isAuthenticated: true,
        slug,
      });

      if (accessResult.status === TRIBE_PAGE_ACCESS_STATUS.hidden) {
        return createHiddenStoryResponse(accessResult.reason);
      }

      const story = await modules.tribes.useCases.getTribeStory({
        tribeSlug: slug,
      });

      return createRouteJsonResponse(
        { story: story ? serializeStory(story) : null },
        HTTP_STATUS.ok
      );
    }
  );
}

type SaveTribeStoryResult = Awaited<
  ReturnType<RequestModules["tribes"]["useCases"]["saveTribeStory"]>
>;

function createPutResultResponse(result: SaveTribeStoryResult, slug: string): Response {
  switch (result.status) {
    case TRIBE_STORY_SAVE_STATUS.updated:
      revalidateTribeStoryAboutCache(slug);

      return createRouteJsonResponse(
        {
          message: STORY_ROUTE_RESPONSE.savedMessage,
          story: result.story ? serializeStory(result.story) : null,
        },
        HTTP_STATUS.ok
      );
    case TRIBE_STORY_SAVE_STATUS.notFound:
      return createRouteJsonResponse(
        { message: STORY_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    case TRIBE_STORY_SAVE_STATUS.forbidden:
    default:
      return createRouteJsonResponse(
        { message: STORY_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
  }
}

export async function PUT(
  request: Request,
  context: TribeRouteContext
) {
  const { slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: STORY_ROUTE_LOG.saveFailureMessage,
      metadata: { slug },
      responseMessage: STORY_ROUTE_RESPONSE.unexpectedSaveMessage,
    },
    async ({ modules }) => {
      const parsedBody: unknown = await request.json().catch(() => ({}));

      const draft = readStoryDraft(parsedBody);

      if ("errorMessage" in draft) {
        return createRouteJsonResponse(
          { message: draft.errorMessage },
          HTTP_STATUS.badRequest
        );
      }

      const result = await modules.tribes.useCases.saveTribeStory({
        ...draft,
        tribeSlug: slug,
      });

      return createPutResultResponse(result, slug);
    }
  );
}
