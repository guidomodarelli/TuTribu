import {
  MESSAGE_FILES,
  MESSAGE_MEDIA_KIND,
  MESSAGE_MUTATION_STATUS,
} from "@/src/modules/messages/constants/message-round";
import type {
  MessageFileDraftCommand,
  MessageMediaDraftCommand,
} from "@/src/modules/messages/application/commands/tribe-message-command";
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
  invalidFileMessage:
    "No pudimos guardar esos archivos adjuntos. Volvé a subirlos.",
  invalidImageMessage: "No pudimos guardar esas imagenes. Volvé a subirlas.",
  invalidMediaMessage:
    "Podés adjuntar hasta 10 archivos entre imágenes y videos.",
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

type UpdateMessageInputPayload = {
  content: string;
  files?: MessageFileDraftCommand[];
  media?: MessageMediaDraftCommand[];
  poll?: UpdateMessagePollPayload;
  title: string;
};

type UpdateMessageRequestBody = {
  content?: unknown;
  files?: unknown;
  media?: unknown;
  poll?: unknown;
  title?: unknown;
};

const UPDATE_MESSAGE_MEDIA_FIELD = {
  altText: "altText",
  assetId: "assetId",
  kind: "kind",
  url: "url",
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

function readMediaPayload(value: unknown): MessageMediaDraftCommand[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const drafts: MessageMediaDraftCommand[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const candidate = item as Record<string, unknown>;
    const kind = candidate[UPDATE_MESSAGE_MEDIA_FIELD.kind];

    if (kind === MESSAGE_MEDIA_KIND.image) {
      const assetId = candidate[UPDATE_MESSAGE_MEDIA_FIELD.assetId];
      const altText = candidate[UPDATE_MESSAGE_MEDIA_FIELD.altText];

      if (typeof assetId !== "string") {
        return null;
      }

      drafts.push({
        assetId,
        kind: MESSAGE_MEDIA_KIND.image,
        ...(typeof altText === "string" ? { altText } : {}),
      });
      continue;
    }

    if (kind === MESSAGE_MEDIA_KIND.video) {
      const url = candidate[UPDATE_MESSAGE_MEDIA_FIELD.url];

      if (typeof url !== "string") {
        return null;
      }

      drafts.push({ kind: MESSAGE_MEDIA_KIND.video, url });
      continue;
    }

    return null;
  }

  return drafts;
}

/**
 * Reads the optional file attachment list from an update payload. The array
 * index expresses the author-chosen download slot.
 *
 * @param value - Raw `files` field from the request body.
 * @returns The file drafts, or `null` when the field is malformed.
 */
function readFilesPayload(value: unknown): MessageFileDraftCommand[] | null {
  if (!Array.isArray(value) || value.length > MESSAGE_FILES.maxCount) {
    return null;
  }

  const drafts: MessageFileDraftCommand[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const assetId = (item as Record<string, unknown>)[
      UPDATE_MESSAGE_MEDIA_FIELD.assetId
    ];

    if (typeof assetId !== "string") {
      return null;
    }

    drafts.push({ assetId });
  }

  return drafts;
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

  if (body.media !== undefined) {
    const media = readMediaPayload(body.media);

    if (!media) {
      return null;
    }

    payload.media = media;
  }

  if (body.files !== undefined) {
    const files = readFilesPayload(body.files);

    if (!files) {
      return null;
    }

    payload.files = files;
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
      ...(payload.files !== undefined ? { files: payload.files } : {}),
      ...(payload.media !== undefined ? { media: payload.media } : {}),
      messageId,
      ...(payload.poll ? { poll: payload.poll } : {}),
      title: payload.title,
      tribeSlug: slug,
      userId: authenticatedMember.id,
    });

    switch (result.status) {
      case MESSAGE_MUTATION_STATUS.updated:
        revalidateTribeRoundCache(slug);

        return createJsonResponse(
          {
            content: result.content,
            message: UPDATE_MESSAGE_ROUTE_RESPONSE.successMessage,
            messageId: result.messageId,
            ...(result.files !== undefined ? { files: result.files } : {}),
            ...(result.media !== undefined ? { media: result.media } : {}),
            ...(result.poll !== undefined ? { poll: result.poll } : {}),
            title: result.title,
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
      case MESSAGE_MUTATION_STATUS.invalidMedia:
        return createJsonResponse(
          { message: UPDATE_MESSAGE_ROUTE_RESPONSE.invalidMediaMessage },
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
      case MESSAGE_MUTATION_STATUS.invalidFile:
        return createJsonResponse(
          { message: UPDATE_MESSAGE_ROUTE_RESPONSE.invalidFileMessage },
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
