import {
  TRIBE_CHANNEL_MUTATION_STATUS,
  TRIBE_CHANNEL_NAME,
} from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import {
  createRouteJsonResponse,
  createStatusMessageResponse,
  handleMemberRoute,
  type RequestModules,
  type StatusMessage,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { readStringField } from "@/app/api/request-body-fields";
import { HTTP_STATUS } from "@/app/api/route-http-status";

const CHANNEL_ROUTE_FIELD = {
  emoji: "emoji",
  name: "name",
  sortOrder: "sortOrder",
  targetChannelId: "targetChannelId",
} as const;

const CHANNEL_ROUTE_LOG = {
  deleteFailureMessage: "Tribe channel deletion failed",
  feature: "messages",
  operation: "manage-tribe-message-channel",
  updateFailureMessage: "Tribe channel update failed",
} as const;

const CHANNEL_ROUTE_RESPONSE = {
  channelHasMessagesMessage: "Elegí otro canal para mover las mensajes.",
  deleteSuccessMessage: "Canal eliminado.",
  duplicateSlugMessage: "Ya existe un canal con ese nombre.",
  forbiddenMessage: "No tenés permisos para gestionar canales.",
  invalidChannelMessage: "El canal destino no pertenece a esta tribu.",
  invalidNameMessage:
    `Definí un nombre de hasta ${TRIBE_CHANNEL_NAME.maxLength} caracteres y elegí un ícono para el canal.`,
  invalidSortOrderMessage: "El orden del canal es inválido.",
  lastChannelMessage: "La tribu necesita al menos un canal.",
  movedAndDeletedMessage: "Canal eliminado y mensajes movidas.",
  notFoundMessage: "No pudimos encontrar el canal.",
  unauthorizedMessage: "Iniciá sesión para gestionar canales.",
  unexpectedDeleteMessage: "No pudimos eliminar el canal. Intentá de nuevo.",
  unexpectedUpdateMessage: "No pudimos actualizar el canal. Intentá de nuevo.",
  updateSuccessMessage: "Canal actualizado.",
} as const;

/** Failure answers of the channel mutations (any other status is forbidden). */
const CHANNEL_FAILURE_RESPONSE = {
  [TRIBE_CHANNEL_MUTATION_STATUS.channelHasMessages]: {
    message: CHANNEL_ROUTE_RESPONSE.channelHasMessagesMessage,
    status: HTTP_STATUS.badRequest,
  },
  [TRIBE_CHANNEL_MUTATION_STATUS.duplicateSlug]: {
    message: CHANNEL_ROUTE_RESPONSE.duplicateSlugMessage,
    status: HTTP_STATUS.badRequest,
  },
  [TRIBE_CHANNEL_MUTATION_STATUS.invalidChannel]: {
    message: CHANNEL_ROUTE_RESPONSE.invalidChannelMessage,
    status: HTTP_STATUS.badRequest,
  },
  [TRIBE_CHANNEL_MUTATION_STATUS.invalidName]: {
    message: CHANNEL_ROUTE_RESPONSE.invalidNameMessage,
    status: HTTP_STATUS.badRequest,
  },
  [TRIBE_CHANNEL_MUTATION_STATUS.lastChannel]: {
    message: CHANNEL_ROUTE_RESPONSE.lastChannelMessage,
    status: HTTP_STATUS.badRequest,
  },
  [TRIBE_CHANNEL_MUTATION_STATUS.notFound]: {
    message: CHANNEL_ROUTE_RESPONSE.notFoundMessage,
    status: HTTP_STATUS.notFound,
  },
} satisfies Partial<Record<string, StatusMessage>>;

const CHANNEL_FORBIDDEN_RESPONSE = {
  message: CHANNEL_ROUTE_RESPONSE.forbiddenMessage,
  status: HTTP_STATUS.forbidden,
} satisfies StatusMessage;

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

type UpdateTribeChannelResult = Awaited<
  ReturnType<RequestModules["messages"]["useCases"]["updateTribeChannel"]>
>;

function createPatchResultResponse(result: UpdateTribeChannelResult, slug: string): Response {
  if (result.status === TRIBE_CHANNEL_MUTATION_STATUS.updated) {
    revalidateTribeRoundCache(slug);

    return createRouteJsonResponse(
      {
        channel: result.channel,
        message: CHANNEL_ROUTE_RESPONSE.updateSuccessMessage,
      },
      HTTP_STATUS.ok
    );
  }

  return createStatusMessageResponse(
    result.status,
    CHANNEL_FAILURE_RESPONSE,
    CHANNEL_FORBIDDEN_RESPONSE
  );
}

const MEMBER_ROUTE_SCOPE = {
  feature: CHANNEL_ROUTE_LOG.feature,
  operation: CHANNEL_ROUTE_LOG.operation,
  unauthorizedMessage: CHANNEL_ROUTE_RESPONSE.unauthorizedMessage,
} as const;

export async function PATCH(
  request: Request,
  context: TribeRouteContext<{ channelId: string }>
) {
  const { channelId, slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: CHANNEL_ROUTE_LOG.updateFailureMessage,
      metadata: { channelId, slug },
      responseMessage: CHANNEL_ROUTE_RESPONSE.unexpectedUpdateMessage,
    },
    async ({ modules }) => {
      const body: unknown = await request.json().catch(() => null);
      const sortOrder = readNumberField(body, CHANNEL_ROUTE_FIELD.sortOrder);

      if (sortOrder === null) {
        return createRouteJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.invalidSortOrderMessage },
          HTTP_STATUS.badRequest
        );
      }

      const result = await modules.messages.useCases.updateTribeChannel({
        channelId,
        tribeSlug: slug,
        emoji: readStringField(body, CHANNEL_ROUTE_FIELD.emoji),
        name: readStringField(body, CHANNEL_ROUTE_FIELD.name),
        sortOrder,
      });

      return createPatchResultResponse(result, slug);
    }
  );
}

type DeleteTribeChannelResult = Awaited<
  ReturnType<RequestModules["messages"]["useCases"]["deleteTribeChannel"]>
>;

function createDeleteResultResponse(result: DeleteTribeChannelResult, slug: string): Response {
  if (result.status === TRIBE_CHANNEL_MUTATION_STATUS.deleted) {
    revalidateTribeRoundCache(slug);

    return createRouteJsonResponse(
      { message: CHANNEL_ROUTE_RESPONSE.deleteSuccessMessage },
      HTTP_STATUS.ok
    );
  }

  if (result.status === TRIBE_CHANNEL_MUTATION_STATUS.movedAndDeleted) {
    revalidateTribeRoundCache(slug);

    return createRouteJsonResponse(
      { message: CHANNEL_ROUTE_RESPONSE.movedAndDeletedMessage },
      HTTP_STATUS.ok
    );
  }

  return createStatusMessageResponse(
    result.status,
    CHANNEL_FAILURE_RESPONSE,
    CHANNEL_FORBIDDEN_RESPONSE
  );
}

export async function DELETE(
  request: Request,
  context: TribeRouteContext<{ channelId: string }>
) {
  const { channelId, slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: CHANNEL_ROUTE_LOG.deleteFailureMessage,
      metadata: { channelId, slug },
      responseMessage: CHANNEL_ROUTE_RESPONSE.unexpectedDeleteMessage,
    },
    async ({ modules }) => {
      const body: unknown = await request.json().catch(() => null);
      const result = await modules.messages.useCases.deleteTribeChannel({
        channelId,
        tribeSlug: slug,
        targetChannelId: readStringField(body, CHANNEL_ROUTE_FIELD.targetChannelId),
      });

      return createDeleteResultResponse(result, slug);
    }
  );
}
