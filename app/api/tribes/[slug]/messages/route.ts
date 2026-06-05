import {
  MESSAGE_MEDIA,
  MESSAGE_MEDIA_KIND,
  MESSAGE_MUTATION_STATUS,
  MESSAGE_POLL_OPTION_TEXT,
  MESSAGE_POLL_OPTIONS,
} from "@/src/modules/messages/constants/message-round";
import type { MessageMediaDraftCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const CREATE_MESSAGE_ROUTE_FIELD = {
  allowMultipleVotes: "allowMultipleVotes",
  channelId: "channelId",
  content: "content",
  media: "media",
  kind: "kind",
  altText: "altText",
  assetId: "assetId",
  options: "options",
  poll: "poll",
  title: "title",
  url: "url",
} as const;

const VIDEO_URL_MAX_LENGTH = 2048;

/**
 * Classifies the outcome of reading the unified media list from a payload.
 */
const CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS = {
  absent: "absent",
  invalidImage: "invalidImage",
  invalidMedia: "invalidMedia",
  invalidVideoUrl: "invalidVideoUrl",
  valid: "valid",
} as const;

type CreateMessageRouteMediaReadResult =
  | { status: typeof CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.absent }
  | { status: typeof CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.invalidImage }
  | { status: typeof CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.invalidMedia }
  | { status: typeof CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.invalidVideoUrl }
  | {
      media: MessageMediaDraftCommand[];
      status: typeof CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.valid;
    };

const CREATE_MESSAGE_ROUTE_LOG = {
  createFailureMessage: "Tribe message creation failed",
  feature: "messages",
  operation: "create-tribe-message",
} as const;

const CREATE_MESSAGE_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para publicar en esta tribu.",
  invalidImageMessage: "No pudimos adjuntar esas imagenes. Volvé a subirlas.",
  invalidMediaMessage:
    "Podés adjuntar hasta 10 archivos entre imágenes y videos.",
  invalidContentMessage: "Completá el título y el contenido antes de publicar.",
  invalidChannelMessage: "Seleccioná un canal antes de publicar.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  invalidPollDuplicateOptionsMessage: "Usá opciones distintas para publicar la encuesta.",
  invalidPollMessage: "No pudimos publicar la encuesta. Revisá los datos.",
  invalidPollMissingOptionsMessage: "Agregá al menos 2 opciones para publicar la encuesta.",
  invalidPollOptionTooLongMessage: "Acortá las opciones de la encuesta.",
  invalidPollTooManyOptionsMessage: "Usá menos opciones para publicar la encuesta.",
  invalidVideoUrlMessage:
    "No pudimos reconocer ese link de video. Probá con YouTube, Vimeo, Wistia o Loom.",
  successMessage: "Mensaje creado.",
  unexpectedMessage: "No pudimos crear el mensaje. Intentalo de nuevo.",
  unauthorizedMessage: "Inicia sesion para publicar.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  created: 201,
  forbidden: 403,
  notFound: 404,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

function readContentFromBody(body: unknown): string {
  if (!body || typeof body !== "object" || !(CREATE_MESSAGE_ROUTE_FIELD.content in body)) {
    return "";
  }

  const content = (body as Record<string, unknown>)[CREATE_MESSAGE_ROUTE_FIELD.content];

  return typeof content === "string" ? content : "";
}

function readChannelIdFromBody(body: unknown): string {
  if (!body || typeof body !== "object" || !(CREATE_MESSAGE_ROUTE_FIELD.channelId in body)) {
    return "";
  }

  const channelId = (body as Record<string, unknown>)[CREATE_MESSAGE_ROUTE_FIELD.channelId];

  return typeof channelId === "string" ? channelId : "";
}

function readTitleFromBody(body: unknown): string {
  if (!body || typeof body !== "object" || !(CREATE_MESSAGE_ROUTE_FIELD.title in body)) {
    return "";
  }

  const title = (body as Record<string, unknown>)[CREATE_MESSAGE_ROUTE_FIELD.title];

  return typeof title === "string" ? title : "";
}

/**
 * Reads and validates the optional unified media list from a create-message
 * payload. Images and external videos travel in one ordered array so the array
 * index expresses the author-chosen global slot.
 *
 * @param body - Parsed request body that may contain a `media` array.
 * @returns Whether the payload omits media, contains an invalid item, exceeds
 *   the combined limit, or contains a normalized media draft list.
 */
function readMediaFromBody(body: unknown): CreateMessageRouteMediaReadResult {
  if (!body || typeof body !== "object" || !(CREATE_MESSAGE_ROUTE_FIELD.media in body)) {
    return { status: CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.absent };
  }

  const media = (body as Record<string, unknown>)[CREATE_MESSAGE_ROUTE_FIELD.media];

  if (!Array.isArray(media) || media.length > MESSAGE_MEDIA.maxCount) {
    return { status: CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.invalidMedia };
  }

  const drafts: MessageMediaDraftCommand[] = [];

  for (const item of media) {
    if (!item || typeof item !== "object") {
      return { status: CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.invalidMedia };
    }

    const itemRecord = item as Record<string, unknown>;
    const kind = itemRecord[CREATE_MESSAGE_ROUTE_FIELD.kind];

    if (kind === MESSAGE_MEDIA_KIND.image) {
      const assetId = itemRecord[CREATE_MESSAGE_ROUTE_FIELD.assetId];
      const altText = itemRecord[CREATE_MESSAGE_ROUTE_FIELD.altText];

      if (typeof assetId !== "string") {
        return { status: CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.invalidImage };
      }

      drafts.push({
        assetId,
        kind: MESSAGE_MEDIA_KIND.image,
        ...(typeof altText === "string" ? { altText } : {}),
      });
      continue;
    }

    if (kind === MESSAGE_MEDIA_KIND.video) {
      const url = itemRecord[CREATE_MESSAGE_ROUTE_FIELD.url];

      if (typeof url !== "string") {
        return { status: CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.invalidVideoUrl };
      }

      const trimmed = url.trim();
      if (trimmed.length === 0 || trimmed.length > VIDEO_URL_MAX_LENGTH) {
        return { status: CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.invalidVideoUrl };
      }

      drafts.push({ kind: MESSAGE_MEDIA_KIND.video, url: trimmed });
      continue;
    }

    return { status: CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.invalidMedia };
  }

  return {
    media: drafts,
    status: CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.valid,
  };
}

function readPollFromBody(body: unknown) {
  if (!body || typeof body !== "object" || !(CREATE_MESSAGE_ROUTE_FIELD.poll in body)) {
    return null;
  }

  const poll = (body as Record<string, unknown>)[CREATE_MESSAGE_ROUTE_FIELD.poll];

  if (!poll || typeof poll !== "object") {
    return null;
  }

  const pollRecord = poll as Record<string, unknown>;
  const options = pollRecord[CREATE_MESSAGE_ROUTE_FIELD.options];
  const allowMultipleVotes =
    pollRecord[CREATE_MESSAGE_ROUTE_FIELD.allowMultipleVotes];

  return {
    allowMultipleVotes: allowMultipleVotes === true,
    options: Array.isArray(options)
      ? options.filter((option): option is string => typeof option === "string")
      : [],
  };
}

function getInvalidPollMessage(poll: ReturnType<typeof readPollFromBody>): string {
  if (!poll) {
    return CREATE_MESSAGE_ROUTE_RESPONSE.invalidPollMessage;
  }

  const trimmedOptions = poll.options
    .map((option) => option.trim())
    .filter(Boolean);
  const uniqueOptionTexts = new Set(
    trimmedOptions.map((option) => option.toLocaleLowerCase())
  );

  if (trimmedOptions.length < MESSAGE_POLL_OPTIONS.minCount) {
    return CREATE_MESSAGE_ROUTE_RESPONSE.invalidPollMissingOptionsMessage;
  }

  if (trimmedOptions.length > MESSAGE_POLL_OPTIONS.maxCount) {
    return CREATE_MESSAGE_ROUTE_RESPONSE.invalidPollTooManyOptionsMessage;
  }

  if (trimmedOptions.some((option) => option.length > MESSAGE_POLL_OPTION_TEXT.maxLength)) {
    return CREATE_MESSAGE_ROUTE_RESPONSE.invalidPollOptionTooLongMessage;
  }

  if (uniqueOptionTexts.size !== trimmedOptions.length) {
    return CREATE_MESSAGE_ROUTE_RESPONSE.invalidPollDuplicateOptionsMessage;
  }

  return CREATE_MESSAGE_ROUTE_RESPONSE.invalidPollMessage;
}

export async function POST(
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
    feature: CREATE_MESSAGE_ROUTE_LOG.feature,
    operation: CREATE_MESSAGE_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: CREATE_MESSAGE_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const poll = readPollFromBody(body);
    const mediaResult = readMediaFromBody(body);

    if (mediaResult.status === CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.invalidImage) {
      return createJsonResponse(
        { message: CREATE_MESSAGE_ROUTE_RESPONSE.invalidImageMessage },
        HTTP_STATUS.badRequest
      );
    }

    if (mediaResult.status === CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.invalidVideoUrl) {
      return createJsonResponse(
        { message: CREATE_MESSAGE_ROUTE_RESPONSE.invalidVideoUrlMessage },
        HTTP_STATUS.badRequest
      );
    }

    if (mediaResult.status === CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.invalidMedia) {
      return createJsonResponse(
        { message: CREATE_MESSAGE_ROUTE_RESPONSE.invalidMediaMessage },
        HTTP_STATUS.badRequest
      );
    }

    const media =
      mediaResult.status === CREATE_MESSAGE_ROUTE_MEDIA_READ_STATUS.valid
        ? mediaResult.media
        : undefined;
    const result = await modules.messages.useCases.createTribeMessage({
      authorId: authenticatedMember.id,
      channelId: readChannelIdFromBody(body),
      tribeSlug: slug,
      content: readContentFromBody(body),
      ...(media !== undefined ? { media } : {}),
      ...(poll ? { poll } : {}),
      title: readTitleFromBody(body),
    });

    switch (result.status) {
      case MESSAGE_MUTATION_STATUS.created:
        revalidateTribeRoundCache(slug);

        return createJsonResponse(
          {
            message: CREATE_MESSAGE_ROUTE_RESPONSE.successMessage,
            tribeMessage: result.message,
          },
          HTTP_STATUS.created
        );
      case MESSAGE_MUTATION_STATUS.invalidContent:
        return createJsonResponse(
          { message: CREATE_MESSAGE_ROUTE_RESPONSE.invalidContentMessage },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.invalidChannel:
        return createJsonResponse(
          { message: CREATE_MESSAGE_ROUTE_RESPONSE.invalidChannelMessage },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.invalidImage:
        return createJsonResponse(
          { message: CREATE_MESSAGE_ROUTE_RESPONSE.invalidImageMessage },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.invalidMedia:
        return createJsonResponse(
          { message: CREATE_MESSAGE_ROUTE_RESPONSE.invalidMediaMessage },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.invalidPoll:
        return createJsonResponse(
          { message: getInvalidPollMessage(poll) },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.invalidVideoUrl:
        return createJsonResponse(
          { message: CREATE_MESSAGE_ROUTE_RESPONSE.invalidVideoUrlMessage },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: CREATE_MESSAGE_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case MESSAGE_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: CREATE_MESSAGE_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: CREATE_MESSAGE_ROUTE_LOG.createFailureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: CREATE_MESSAGE_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
