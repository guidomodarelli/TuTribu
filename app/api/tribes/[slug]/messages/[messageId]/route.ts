import {
  MESSAGE_IMAGES,
  MESSAGE_MUTATION_STATUS,
} from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { isUuidRouteParam } from "@/src/modules/messages/infrastructure/http/message-route-params";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const DELETE_MESSAGE_ROUTE_LOG = {
  deleteFailureMessage: "Tribe message deletion failed",
  feature: "messages",
  operation: "delete-tribe-message",
} as const;

const DELETE_MESSAGE_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para eliminar este mensaje.",
  notFoundMessage: "No pudimos encontrar el mensaje.",
  successMessage: "Mensaje eliminado.",
  unexpectedMessage: "No pudimos eliminar el mensaje. Intentalo de nuevo.",
  unauthorizedMessage: "Inicia sesion para eliminar mensajes.",
} as const;

const UPDATE_MESSAGE_ROUTE_LOG = {
  feature: "messages",
  operation: "update-tribe-message-content",
  updateFailureMessage: "Tribe message content update failed",
} as const;

const UPDATE_MESSAGE_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para editar este mensaje.",
  invalidImageMessage: "No pudimos guardar esas imagenes. Volvé a subirlas.",
  invalidContentMessage:
    "Revisa el titulo y el contenido del mensaje antes de guardar.",
  invalidPayloadMessage: "Enviaste datos invalidos para editar el mensaje.",
  invalidPollMessage:
    "Revisa la pregunta y las opciones de la encuesta antes de guardar.",
  invalidVideoMessage:
    "El link del video no es valido. Probá con YouTube, Vimeo, Wistia o Loom.",
  notFoundMessage: "No pudimos encontrar el mensaje.",
  pollHasVotesMessage:
    "No podes editar una encuesta que ya recibió votos.",
  pollMissingMessage:
    "El mensaje no tiene una encuesta para editar.",
  successMessage: "Mensaje actualizado.",
  unauthorizedMessage: "Inicia sesion para editar mensajes.",
  unexpectedMessage: "No pudimos editar el mensaje. Intentalo de nuevo.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  conflict: 409,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

type UpdateMessagePollPayload = {
  allowMultipleVotes: boolean;
  options: string[];
};

type UpdateMessageVideoPayload = { url: string } | null;

type UpdateMessageImagePayload = {
  altText?: string;
  assetId: string;
};

type UpdateMessageInputPayload = {
  content: string;
  images?: UpdateMessageImagePayload[];
  poll?: UpdateMessagePollPayload;
  title: string;
  video?: UpdateMessageVideoPayload;
};

type UpdateMessageRequestBody = {
  content?: unknown;
  images?: unknown;
  poll?: unknown;
  title?: unknown;
  video?: unknown;
};

const UPDATE_MESSAGE_IMAGE_FIELD = {
  altText: "altText",
  assetId: "assetId",
} as const;

function readPollPayload(value: unknown): UpdateMessagePollPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    allowMultipleVotes?: unknown;
    options?: unknown;
  };

  if (
    typeof candidate.allowMultipleVotes !== "boolean" ||
    !Array.isArray(candidate.options) ||
    !candidate.options.every((option) => typeof option === "string")
  ) {
    return null;
  }

  return {
    allowMultipleVotes: candidate.allowMultipleVotes,
    options: candidate.options as string[],
  };
}

function readVideoPayload(
  value: unknown
): { ok: true; value: UpdateMessageVideoPayload } | { ok: false } {
  if (value === null) {
    return { ok: true, value: null };
  }

  if (value && typeof value === "object") {
    const candidate = value as { url?: unknown };

    if (typeof candidate.url === "string") {
      return { ok: true, value: { url: candidate.url } };
    }
  }

  return { ok: false };
}

function readImagesPayload(value: unknown): UpdateMessageImagePayload[] | null {
  if (!Array.isArray(value) || value.length > MESSAGE_IMAGES.maxCount) {
    return null;
  }

  const images = value.map((image) => {
    if (!image || typeof image !== "object") {
      return null;
    }

    const candidate = image as Record<string, unknown>;
    const assetId = candidate[UPDATE_MESSAGE_IMAGE_FIELD.assetId];
    const altText = candidate[UPDATE_MESSAGE_IMAGE_FIELD.altText];

    if (typeof assetId !== "string") {
      return null;
    }

    return {
      assetId,
      ...(typeof altText === "string" ? { altText } : {}),
    };
  });

  if (images.some((image) => image === null)) {
    return null;
  }

  return images as UpdateMessageImagePayload[];
}

function readUpdateMessagePayload(
  body: UpdateMessageRequestBody | null
): UpdateMessageInputPayload | null {
  if (
    !body ||
    typeof body.content !== "string" ||
    typeof body.title !== "string"
  ) {
    return null;
  }

  const payload: UpdateMessageInputPayload = {
    content: body.content,
    title: body.title,
  };

  if (body.poll !== undefined) {
    const poll = readPollPayload(body.poll);

    if (!poll) {
      return null;
    }

    payload.poll = poll;
  }

  if (body.video !== undefined) {
    const video = readVideoPayload(body.video);

    if (!video.ok) {
      return null;
    }

    payload.video = video.value;
  }

  if (body.images !== undefined) {
    const images = readImagesPayload(body.images);

    if (!images) {
      return null;
    }

    payload.images = images;
  }

  return payload;
}

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{
      messageId: string;
      slug: string;
    }>;
  }
) {
  const { messageId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: DELETE_MESSAGE_ROUTE_LOG.feature,
    operation: DELETE_MESSAGE_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: DELETE_MESSAGE_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  if (!isUuidRouteParam(messageId)) {
    return createJsonResponse(
      { message: DELETE_MESSAGE_ROUTE_RESPONSE.notFoundMessage },
      HTTP_STATUS.notFound
    );
  }

  try {
    const result = await modules.messages.useCases.deleteTribeMessage({
      messageId,
      tribeSlug: slug,
      userId: authenticatedMember.id,
    });

    switch (result.status) {
      case MESSAGE_MUTATION_STATUS.deleted:
        revalidateTribeRoundCache(slug);

        return createJsonResponse(
          { message: DELETE_MESSAGE_ROUTE_RESPONSE.successMessage },
          HTTP_STATUS.ok
        );
      case MESSAGE_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: DELETE_MESSAGE_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case MESSAGE_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: DELETE_MESSAGE_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: DELETE_MESSAGE_ROUTE_LOG.deleteFailureMessage,
      error,
      metadata: {
        messageId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: DELETE_MESSAGE_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      messageId: string;
      slug: string;
    }>;
  }
) {
  const { messageId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: UPDATE_MESSAGE_ROUTE_LOG.feature,
    operation: UPDATE_MESSAGE_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: UPDATE_MESSAGE_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  if (!isUuidRouteParam(messageId)) {
    return createJsonResponse(
      { message: UPDATE_MESSAGE_ROUTE_RESPONSE.notFoundMessage },
      HTTP_STATUS.notFound
    );
  }

  const body = (await request
    .json()
    .catch(() => null)) as UpdateMessageRequestBody | null;
  const payload = readUpdateMessagePayload(body);

  if (!payload) {
    return createJsonResponse(
      { message: UPDATE_MESSAGE_ROUTE_RESPONSE.invalidPayloadMessage },
      HTTP_STATUS.badRequest
    );
  }

  try {
    const result = await modules.messages.useCases.updateTribeMessageContent({
      content: payload.content,
      ...(payload.images !== undefined ? { images: payload.images } : {}),
      messageId,
      ...(payload.poll ? { poll: payload.poll } : {}),
      title: payload.title,
      tribeSlug: slug,
      userId: authenticatedMember.id,
      ...(payload.video !== undefined ? { video: payload.video } : {}),
    });

    switch (result.status) {
      case MESSAGE_MUTATION_STATUS.updated:
        revalidateTribeRoundCache(slug);

        return createJsonResponse(
          {
            content: result.content,
            message: UPDATE_MESSAGE_ROUTE_RESPONSE.successMessage,
            messageId: result.messageId,
            ...(result.images !== undefined ? { images: result.images } : {}),
            ...(result.poll !== undefined ? { poll: result.poll } : {}),
            title: result.title,
            ...(result.video !== undefined ? { video: result.video } : {}),
          },
          HTTP_STATUS.ok
        );
      case MESSAGE_MUTATION_STATUS.invalidContent:
        return createJsonResponse(
          { message: UPDATE_MESSAGE_ROUTE_RESPONSE.invalidContentMessage },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.invalidImage:
        return createJsonResponse(
          { message: UPDATE_MESSAGE_ROUTE_RESPONSE.invalidImageMessage },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.invalidPoll:
        return createJsonResponse(
          { message: UPDATE_MESSAGE_ROUTE_RESPONSE.invalidPollMessage },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.invalidVideoUrl:
        return createJsonResponse(
          { message: UPDATE_MESSAGE_ROUTE_RESPONSE.invalidVideoMessage },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.pollHasVotes:
        return createJsonResponse(
          { message: UPDATE_MESSAGE_ROUTE_RESPONSE.pollHasVotesMessage },
          HTTP_STATUS.conflict
        );
      case MESSAGE_MUTATION_STATUS.pollMissing:
        return createJsonResponse(
          { message: UPDATE_MESSAGE_ROUTE_RESPONSE.pollMissingMessage },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: UPDATE_MESSAGE_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case MESSAGE_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: UPDATE_MESSAGE_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: UPDATE_MESSAGE_ROUTE_LOG.updateFailureMessage,
      error,
      metadata: {
        messageId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: UPDATE_MESSAGE_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
