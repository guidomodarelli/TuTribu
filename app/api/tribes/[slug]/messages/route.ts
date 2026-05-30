import {
  MESSAGE_MUTATION_STATUS,
  MESSAGE_IMAGES,
  MESSAGE_POLL_OPTION_TEXT,
  MESSAGE_POLL_OPTIONS,
  MESSAGE_POLL_QUESTION,
} from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const CREATE_MESSAGE_ROUTE_FIELD = {
  allowMultipleVotes: "allowMultipleVotes",
  channelId: "channelId",
  content: "content",
  images: "images",
  altText: "altText",
  assetId: "assetId",
  options: "options",
  poll: "poll",
  question: "question",
  title: "title",
  url: "url",
  video: "video",
} as const;

const VIDEO_URL_MAX_LENGTH = 2048;

/**
 * Classifies whether the message payload contains a usable video draft.
 */
const CREATE_MESSAGE_ROUTE_VIDEO_READ_STATUS = {
  absent: "absent",
  invalid: "invalid",
  valid: "valid",
} as const;

type CreateMessageRouteVideoReadResult =
  | { status: typeof CREATE_MESSAGE_ROUTE_VIDEO_READ_STATUS.absent }
  | { status: typeof CREATE_MESSAGE_ROUTE_VIDEO_READ_STATUS.invalid }
  | {
      status: typeof CREATE_MESSAGE_ROUTE_VIDEO_READ_STATUS.valid;
      video: { url: string };
    };

const CREATE_MESSAGE_ROUTE_LOG = {
  createFailureMessage: "Tribe message creation failed",
  feature: "messages",
  operation: "create-tribe-message",
} as const;

const CREATE_MESSAGE_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para publicar en esta tribu.",
  invalidImageMessage: "No pudimos adjuntar esas imagenes. Volvé a subirlas.",
  invalidContentMessage: "Completá el título y el contenido antes de publicar.",
  invalidChannelMessage: "Seleccioná un canal antes de publicar.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  invalidPollDuplicateOptionsMessage: "Usá opciones distintas para publicar la encuesta.",
  invalidPollMessage: "No pudimos publicar la encuesta. Revisá los datos.",
  invalidPollMissingOptionsMessage: "Agregá al menos 2 opciones para publicar la encuesta.",
  invalidPollMissingQuestionMessage: "Completá la pregunta para publicar la encuesta.",
  invalidPollOptionTooLongMessage: "Acortá las opciones de la encuesta.",
  invalidPollQuestionTooLongMessage: "Acortá la pregunta de la encuesta.",
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

function readImagesFromBody(body: unknown) {
  if (!body || typeof body !== "object" || !(CREATE_MESSAGE_ROUTE_FIELD.images in body)) {
    return undefined;
  }

  const images = (body as Record<string, unknown>)[CREATE_MESSAGE_ROUTE_FIELD.images];

  if (!Array.isArray(images) || images.length > MESSAGE_IMAGES.maxCount) {
    return null;
  }

  const drafts = images.map((image) => {
    if (!image || typeof image !== "object") {
      return null;
    }

    const imageRecord = image as Record<string, unknown>;
    const assetId = imageRecord[CREATE_MESSAGE_ROUTE_FIELD.assetId];
    const altText = imageRecord[CREATE_MESSAGE_ROUTE_FIELD.altText];

    if (typeof assetId !== "string") {
      return null;
    }

    return {
      assetId,
      ...(typeof altText === "string" ? { altText } : {}),
    };
  });

  if (drafts.some((image) => image === null)) {
    return null;
  }

  return drafts as { altText?: string; assetId: string }[];
}

/**
 * Reads and validates the optional external-video draft from a create-message payload.
 *
 * @param body - Parsed request body that may contain a `video.url` value.
 * @returns Whether the payload omits video data, contains invalid video data, or contains a trimmed URL.
 */
function readVideoFromBody(body: unknown): CreateMessageRouteVideoReadResult {
  if (!body || typeof body !== "object" || !(CREATE_MESSAGE_ROUTE_FIELD.video in body)) {
    return { status: CREATE_MESSAGE_ROUTE_VIDEO_READ_STATUS.absent };
  }

  const video = (body as Record<string, unknown>)[CREATE_MESSAGE_ROUTE_FIELD.video];
  if (!video || typeof video !== "object") {
    return { status: CREATE_MESSAGE_ROUTE_VIDEO_READ_STATUS.invalid };
  }

  const url = (video as Record<string, unknown>)[CREATE_MESSAGE_ROUTE_FIELD.url];
  if (typeof url !== "string") {
    return { status: CREATE_MESSAGE_ROUTE_VIDEO_READ_STATUS.invalid };
  }

  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > VIDEO_URL_MAX_LENGTH) {
    return { status: CREATE_MESSAGE_ROUTE_VIDEO_READ_STATUS.invalid };
  }

  return {
    status: CREATE_MESSAGE_ROUTE_VIDEO_READ_STATUS.valid,
    video: { url: trimmed },
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
  const question = pollRecord[CREATE_MESSAGE_ROUTE_FIELD.question];
  const options = pollRecord[CREATE_MESSAGE_ROUTE_FIELD.options];
  const allowMultipleVotes =
    pollRecord[CREATE_MESSAGE_ROUTE_FIELD.allowMultipleVotes];

  return {
    allowMultipleVotes: allowMultipleVotes === true,
    options: Array.isArray(options)
      ? options.filter((option): option is string => typeof option === "string")
      : [],
    question: typeof question === "string" ? question : "",
  };
}

function getInvalidPollMessage(poll: ReturnType<typeof readPollFromBody>): string {
  if (!poll) {
    return CREATE_MESSAGE_ROUTE_RESPONSE.invalidPollMessage;
  }

  const trimmedQuestion = poll.question.trim();
  const trimmedOptions = poll.options
    .map((option) => option.trim())
    .filter(Boolean);
  const uniqueOptionTexts = new Set(
    trimmedOptions.map((option) => option.toLocaleLowerCase())
  );

  if (!trimmedQuestion) {
    return CREATE_MESSAGE_ROUTE_RESPONSE.invalidPollMissingQuestionMessage;
  }

  if (trimmedQuestion.length > MESSAGE_POLL_QUESTION.maxLength) {
    return CREATE_MESSAGE_ROUTE_RESPONSE.invalidPollQuestionTooLongMessage;
  }

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
    const images = readImagesFromBody(body);
    const videoResult = readVideoFromBody(body);

    if (images === null) {
      return createJsonResponse(
        { message: CREATE_MESSAGE_ROUTE_RESPONSE.invalidImageMessage },
        HTTP_STATUS.badRequest
      );
    }

    if (videoResult.status === CREATE_MESSAGE_ROUTE_VIDEO_READ_STATUS.invalid) {
      return createJsonResponse(
        { message: CREATE_MESSAGE_ROUTE_RESPONSE.invalidVideoUrlMessage },
        HTTP_STATUS.badRequest
      );
    }

    const video =
      videoResult.status === CREATE_MESSAGE_ROUTE_VIDEO_READ_STATUS.valid
        ? videoResult.video
        : null;
    const result = await modules.messages.useCases.createTribeMessage({
      authorId: authenticatedMember.id,
      channelId: readChannelIdFromBody(body),
      tribeSlug: slug,
      content: readContentFromBody(body),
      ...(images !== undefined ? { images } : {}),
      ...(poll ? { poll } : {}),
      ...(video ? { video } : {}),
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
