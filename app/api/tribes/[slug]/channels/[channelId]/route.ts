import { TRIBE_CHANNEL_MUTATION_STATUS } from "@/src/modules/posts/constants/post-feed";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const CHANNEL_ROUTE_FIELD = {
  emoji: "emoji",
  name: "name",
  sortOrder: "sortOrder",
  targetChannelId: "targetChannelId",
} as const;

const CHANNEL_ROUTE_LOG = {
  deleteFailureMessage: "Tribe channel deletion failed",
  feature: "posts",
  operation: "manage-tribe-post-channel",
  updateFailureMessage: "Tribe channel update failed",
} as const;

const CHANNEL_ROUTE_RESPONSE = {
  channelHasPostsMessage: "Elegí otro canal para mover las publicaciones.",
  deleteSuccessMessage: "Canal eliminado.",
  duplicateSlugMessage: "Ya existe un canal con ese nombre.",
  forbiddenMessage: "No tenés permisos para gestionar canales.",
  invalidChannelMessage: "El canal destino no pertenece a esta tribu.",
  invalidNameMessage: "Definí un nombre y un ícono para el canal.",
  invalidSortOrderMessage: "El orden del canal es inválido.",
  lastChannelMessage: "La tribu necesita al menos un canal.",
  movedAndDeletedMessage: "Canal eliminado y publicaciones movidas.",
  notFoundMessage: "No pudimos encontrar el canal.",
  unauthorizedMessage: "Iniciá sesión para gestionar canales.",
  unexpectedDeleteMessage: "No pudimos eliminar el canal. Intentá de nuevo.",
  unexpectedUpdateMessage: "No pudimos actualizar el canal. Intentá de nuevo.",
  updateSuccessMessage: "Canal actualizado.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

function readStringField(body: unknown, field: string): string {
  if (!body || typeof body !== "object" || !(field in body)) {
    return "";
  }

  const value = (body as Record<string, unknown>)[field];

  return typeof value === "string" ? value : "";
}

function readNumberField(body: unknown, field: string): number | null {
  if (!body || typeof body !== "object" || !(field in body)) {
    return null;
  }

  const value = (body as Record<string, unknown>)[field];
  if (typeof value === "number") {
    return Number.isFinite(value) && Number.isInteger(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) && Number.isInteger(parsedValue)
    ? parsedValue
    : null;
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      channelId: string;
      slug: string;
    }>;
  }
) {
  const { channelId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: CHANNEL_ROUTE_LOG.feature,
    operation: CHANNEL_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: CHANNEL_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const sortOrder = readNumberField(body, CHANNEL_ROUTE_FIELD.sortOrder);

    if (sortOrder === null) {
      return createJsonResponse(
        { message: CHANNEL_ROUTE_RESPONSE.invalidSortOrderMessage },
        HTTP_STATUS.badRequest
      );
    }

    const result = await modules.posts.useCases.updateTribeChannel({
      channelId,
      tribeSlug: slug,
      emoji: readStringField(body, CHANNEL_ROUTE_FIELD.emoji),
      name: readStringField(body, CHANNEL_ROUTE_FIELD.name),
      sortOrder,
    });

    switch (result.status) {
      case TRIBE_CHANNEL_MUTATION_STATUS.updated:
        return createJsonResponse(
          {
            channel: result.channel,
            message: CHANNEL_ROUTE_RESPONSE.updateSuccessMessage,
          },
          HTTP_STATUS.ok
        );
      case TRIBE_CHANNEL_MUTATION_STATUS.invalidName:
        return createJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.invalidNameMessage },
          HTTP_STATUS.badRequest
        );
      case TRIBE_CHANNEL_MUTATION_STATUS.duplicateSlug:
        return createJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.duplicateSlugMessage },
          HTTP_STATUS.badRequest
        );
      case TRIBE_CHANNEL_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case TRIBE_CHANNEL_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: CHANNEL_ROUTE_LOG.updateFailureMessage,
      error,
      metadata: {
        channelId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: CHANNEL_ROUTE_RESPONSE.unexpectedUpdateMessage },
      HTTP_STATUS.serverError
    );
  }
}

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{
      channelId: string;
      slug: string;
    }>;
  }
) {
  const { channelId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: CHANNEL_ROUTE_LOG.feature,
    operation: CHANNEL_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: CHANNEL_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const result = await modules.posts.useCases.deleteTribeChannel({
      channelId,
      tribeSlug: slug,
      targetChannelId: readStringField(body, CHANNEL_ROUTE_FIELD.targetChannelId),
    });

    switch (result.status) {
      case TRIBE_CHANNEL_MUTATION_STATUS.deleted:
        return createJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.deleteSuccessMessage },
          HTTP_STATUS.ok
        );
      case TRIBE_CHANNEL_MUTATION_STATUS.movedAndDeleted:
        return createJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.movedAndDeletedMessage },
          HTTP_STATUS.ok
        );
      case TRIBE_CHANNEL_MUTATION_STATUS.channelHasPosts:
        return createJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.channelHasPostsMessage },
          HTTP_STATUS.badRequest
        );
      case TRIBE_CHANNEL_MUTATION_STATUS.invalidChannel:
        return createJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.invalidChannelMessage },
          HTTP_STATUS.badRequest
        );
      case TRIBE_CHANNEL_MUTATION_STATUS.lastChannel:
        return createJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.lastChannelMessage },
          HTTP_STATUS.badRequest
        );
      case TRIBE_CHANNEL_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case TRIBE_CHANNEL_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: CHANNEL_ROUTE_LOG.deleteFailureMessage,
      error,
      metadata: {
        channelId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: CHANNEL_ROUTE_RESPONSE.unexpectedDeleteMessage },
      HTTP_STATUS.serverError
    );
  }
}
