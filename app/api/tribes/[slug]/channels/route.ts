import {
  TRIBE_CHANNEL_MUTATION_STATUS,
  TRIBE_CHANNEL_NAME,
} from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { createRequestModules } from "@/src/modules/setup";
import { createRouteObservation } from "@/src/modules/shared/infrastructure/observability/route-observation";

const CHANNEL_ROUTE_FIELD = {
  emoji: "emoji",
  name: "name",
} as const;

const CHANNEL_ROUTE_LOG = {
  createFailureMessage: "Tribe channel creation failed",
  createSuccessMessage: "Tribe channel creation completed",
  feature: "messages",
  listBlockedMessage: "Tribe channel listing blocked",
  listFailureMessage: "Tribe channel listing failed",
  listSuccessMessage: "Tribe channel listing completed",
  operation: "manage-tribe-channels",
} as const;

const CHANNEL_ROUTE_RESPONSE = {
  duplicateSlugMessage: "Ya existe un canal con ese nombre.",
  forbiddenMessage: "No tenés permisos para gestionar canales.",
  invalidNameMessage:
    `Definí un nombre de hasta ${TRIBE_CHANNEL_NAME.maxLength} caracteres y elegí un ícono para el canal.`,
  notFoundMessage: "No pudimos encontrar la tribu.",
  successMessage: "Canal creado.",
  unauthorizedMessage: "Iniciá sesión para gestionar canales.",
  unexpectedListMessage: "No pudimos cargar los canales. Intentá de nuevo.",
  unexpectedMessage: "No pudimos guardar el canal. Intentá de nuevo.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  created: 201,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

function readStringField(body: unknown, field: string): string {
  if (!body || typeof body !== "object" || !(field in body)) {
    return "";
  }

  const value = (body as Record<string, unknown>)[field];

  return typeof value === "string" ? value : "";
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
  const routeObservation = createRouteObservation({
    feature: CHANNEL_ROUTE_LOG.feature,
    operation: CHANNEL_ROUTE_LOG.operation,
    request,
  });
  const modules = await createRequestModules({
    requestId: routeObservation.requestId,
  });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return routeObservation.createJsonResponse(
      { message: CHANNEL_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized,
      {
        message: CHANNEL_ROUTE_LOG.listBlockedMessage,
        metadata: {
          slug,
        },
        outcome: "unauthorized",
        level: "warn",
      }
    );
  }

  try {
    const result = await modules.messages.useCases.listTribeChannels({
      tribeSlug: slug,
      viewerId: authenticatedMember.id,
    });

    return routeObservation.createJsonResponse(result, HTTP_STATUS.ok, {
      message: CHANNEL_ROUTE_LOG.listSuccessMessage,
      metadata: {
        channelCount: result.channels.length,
        slug,
        viewerId: authenticatedMember.id,
      },
      outcome: "success",
    });
  } catch (error) {
    routeObservation.logRouteError({
      message: CHANNEL_ROUTE_LOG.listFailureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
      outcome: "error",
      status: HTTP_STATUS.serverError,
    });

    return routeObservation.createJsonResponse(
      { message: CHANNEL_ROUTE_RESPONSE.unexpectedListMessage },
      HTTP_STATUS.serverError
    );
  }
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
  const routeObservation = createRouteObservation({
    feature: CHANNEL_ROUTE_LOG.feature,
    operation: CHANNEL_ROUTE_LOG.operation,
    request,
  });
  const modules = await createRequestModules({
    requestId: routeObservation.requestId,
  });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return routeObservation.createJsonResponse(
      { message: CHANNEL_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized,
      {
        message: CHANNEL_ROUTE_LOG.createFailureMessage,
        metadata: {
          slug,
        },
        outcome: "unauthorized",
        level: "warn",
      }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const result = await modules.messages.useCases.createTribeChannel({
      tribeSlug: slug,
      emoji: readStringField(body, CHANNEL_ROUTE_FIELD.emoji),
      name: readStringField(body, CHANNEL_ROUTE_FIELD.name),
    });

    switch (result.status) {
      case TRIBE_CHANNEL_MUTATION_STATUS.created:
        revalidateTribeRoundCache(slug);

        return routeObservation.createJsonResponse(
          {
            channel: result.channel,
            message: CHANNEL_ROUTE_RESPONSE.successMessage,
          },
          HTTP_STATUS.created,
          {
            message: CHANNEL_ROUTE_LOG.createSuccessMessage,
            metadata: {
              channelId: result.channel.id,
              slug,
              viewerId: authenticatedMember.id,
            },
            outcome: TRIBE_CHANNEL_MUTATION_STATUS.created,
          }
        );
      case TRIBE_CHANNEL_MUTATION_STATUS.invalidName:
        return routeObservation.createJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.invalidNameMessage },
          HTTP_STATUS.badRequest,
          {
            message: CHANNEL_ROUTE_LOG.createFailureMessage,
            metadata: {
              slug,
              viewerId: authenticatedMember.id,
            },
            outcome: result.status,
            level: "warn",
          }
        );
      case TRIBE_CHANNEL_MUTATION_STATUS.duplicateSlug:
        return routeObservation.createJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.duplicateSlugMessage },
          HTTP_STATUS.badRequest,
          {
            message: CHANNEL_ROUTE_LOG.createFailureMessage,
            metadata: {
              slug,
              viewerId: authenticatedMember.id,
            },
            outcome: result.status,
            level: "warn",
          }
        );
      case TRIBE_CHANNEL_MUTATION_STATUS.notFound:
        return routeObservation.createJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound,
          {
            message: CHANNEL_ROUTE_LOG.createFailureMessage,
            metadata: {
              slug,
              viewerId: authenticatedMember.id,
            },
            outcome: result.status,
            level: "warn",
          }
        );
      case TRIBE_CHANNEL_MUTATION_STATUS.forbidden:
      default:
        return routeObservation.createJsonResponse(
          { message: CHANNEL_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden,
          {
            message: CHANNEL_ROUTE_LOG.createFailureMessage,
            metadata: {
              slug,
              viewerId: authenticatedMember.id,
            },
            outcome: result.status,
            level: "warn",
          }
        );
    }
  } catch (error) {
    routeObservation.logRouteError({
      message: CHANNEL_ROUTE_LOG.createFailureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
      outcome: "error",
      status: HTTP_STATUS.serverError,
    });

    return routeObservation.createJsonResponse(
      { message: CHANNEL_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
