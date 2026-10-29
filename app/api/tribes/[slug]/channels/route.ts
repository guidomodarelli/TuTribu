import {
  TRIBE_CHANNEL_MUTATION_STATUS,
  TRIBE_CHANNEL_NAME,
} from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { createRequestModules } from "@/src/modules/setup";
import { createRouteObservation } from "@/src/modules/shared/infrastructure/observability/route-observation";
import { readStringField } from "@/app/api/request-body-fields";
import { HTTP_STATUS } from "@/app/api/route-http-status";

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

const CHANNEL_ROUTE_OBSERVATION_LEVEL = {
  warn: "warn",
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

type RouteObservation = ReturnType<typeof createRouteObservation>;

/**
 * Opens the observed request scope of a channel route: the route observation,
 * request modules correlated with its request id, and the signed-in member.
 * Without a session it answers 401 and logs the blocked outcome.
 */
async function openChannelRouteScope(
  request: Request,
  input: { blockedLogMessage: string; slug: string }
) {
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
    return {
      isOpen: false,
      response: routeObservation.createJsonResponse(
        { message: CHANNEL_ROUTE_RESPONSE.unauthorizedMessage },
        HTTP_STATUS.unauthorized,
        {
          message: input.blockedLogMessage,
          metadata: {
            slug: input.slug,
          },
          outcome: "unauthorized",
          level: CHANNEL_ROUTE_OBSERVATION_LEVEL.warn,
        }
      ),
    } as const;
  }

  return { authenticatedMember, isOpen: true, modules, routeObservation } as const;
}

/** Logs an unexpected channel route failure and answers the safe 500. */
function respondWithChannelRouteError(
  routeObservation: RouteObservation,
  input: {
    error: unknown;
    logMessage: string;
    responseMessage: string;
    slug: string;
    viewerId: string;
  }
): Response {
  routeObservation.logRouteError({
    message: input.logMessage,
    error: input.error,
    metadata: {
      slug: input.slug,
      viewerId: input.viewerId,
    },
    outcome: "error",
    status: HTTP_STATUS.serverError,
  });

  return routeObservation.createJsonResponse(
    { message: input.responseMessage },
    HTTP_STATUS.serverError
  );
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
  const scope = await openChannelRouteScope(request, {
    blockedLogMessage: CHANNEL_ROUTE_LOG.listBlockedMessage,
    slug,
  });

  if (!scope.isOpen) {
    return scope.response;
  }

  const { authenticatedMember, modules, routeObservation } = scope;

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
    return respondWithChannelRouteError(routeObservation, {
      error,
      logMessage: CHANNEL_ROUTE_LOG.listFailureMessage,
      responseMessage: CHANNEL_ROUTE_RESPONSE.unexpectedListMessage,
      slug,
      viewerId: authenticatedMember.id,
    });
  }
}

type RequestModules = Awaited<ReturnType<typeof createRequestModules>>;

type CreateTribeChannelResult = Awaited<
  ReturnType<RequestModules["messages"]["useCases"]["createTribeChannel"]>
>;

type CreateChannelResponseContext = {
  routeObservation: ReturnType<typeof createRouteObservation>;
  slug: string;
  viewerId: string;
};

function createPostResultResponse(
  result: CreateTribeChannelResult,
  { routeObservation, slug, viewerId }: CreateChannelResponseContext
): Response {
  const reject = (message: string, status: number) =>
    routeObservation.createJsonResponse({ message }, status, {
      message: CHANNEL_ROUTE_LOG.createFailureMessage,
      metadata: {
        slug,
        viewerId,
      },
      outcome: result.status,
      level: CHANNEL_ROUTE_OBSERVATION_LEVEL.warn,
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
            viewerId,
          },
          outcome: TRIBE_CHANNEL_MUTATION_STATUS.created,
        }
      );
    case TRIBE_CHANNEL_MUTATION_STATUS.invalidName:
      return reject(CHANNEL_ROUTE_RESPONSE.invalidNameMessage, HTTP_STATUS.badRequest);
    case TRIBE_CHANNEL_MUTATION_STATUS.duplicateSlug:
      return reject(CHANNEL_ROUTE_RESPONSE.duplicateSlugMessage, HTTP_STATUS.badRequest);
    case TRIBE_CHANNEL_MUTATION_STATUS.notFound:
      return reject(CHANNEL_ROUTE_RESPONSE.notFoundMessage, HTTP_STATUS.notFound);
    case TRIBE_CHANNEL_MUTATION_STATUS.forbidden:
    default:
      return reject(CHANNEL_ROUTE_RESPONSE.forbiddenMessage, HTTP_STATUS.forbidden);
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
  const scope = await openChannelRouteScope(request, {
    blockedLogMessage: CHANNEL_ROUTE_LOG.createFailureMessage,
    slug,
  });

  if (!scope.isOpen) {
    return scope.response;
  }

  const { authenticatedMember, modules, routeObservation } = scope;

  try {
    const body: unknown = await request.json().catch(() => null);
    const result = await modules.messages.useCases.createTribeChannel({
      tribeSlug: slug,
      emoji: readStringField(body, CHANNEL_ROUTE_FIELD.emoji),
      name: readStringField(body, CHANNEL_ROUTE_FIELD.name),
    });

    return createPostResultResponse(result, {
      routeObservation,
      slug,
      viewerId: authenticatedMember.id,
    });
  } catch (error) {
    return respondWithChannelRouteError(routeObservation, {
      error,
      logMessage: CHANNEL_ROUTE_LOG.createFailureMessage,
      responseMessage: CHANNEL_ROUTE_RESPONSE.unexpectedMessage,
      slug,
      viewerId: authenticatedMember.id,
    });
  }
}
