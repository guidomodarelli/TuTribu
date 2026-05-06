import { TRIBE_CHANNEL_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const CHANNEL_ROUTE_FIELD = {
  emoji: "emoji",
  name: "name",
} as const;

const CHANNEL_ROUTE_LOG = {
  createFailureMessage: "Tribe channel creation failed",
  feature: "messages",
  listFailureMessage: "Tribe channel listing failed",
  operation: "manage-tribe-channels",
} as const;

const CHANNEL_ROUTE_RESPONSE = {
  duplicateSlugMessage: "Ya existe un canal con ese nombre.",
  forbiddenMessage: "No tenés permisos para gestionar canales.",
  invalidNameMessage: "Definí un nombre y un ícono para el canal.",
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
    const result = await modules.messages.useCases.listTribeChannels({
      tribeSlug: slug,
      viewerId: authenticatedMember.id,
    });

    return createJsonResponse(result, HTTP_STATUS.ok);
  } catch (error) {
    logger.error({
      message: CHANNEL_ROUTE_LOG.listFailureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
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
    const result = await modules.messages.useCases.createTribeChannel({
      tribeSlug: slug,
      emoji: readStringField(body, CHANNEL_ROUTE_FIELD.emoji),
      name: readStringField(body, CHANNEL_ROUTE_FIELD.name),
    });

    switch (result.status) {
      case TRIBE_CHANNEL_MUTATION_STATUS.created:
        return createJsonResponse(
          {
            channel: result.channel,
            message: CHANNEL_ROUTE_RESPONSE.successMessage,
          },
          HTTP_STATUS.created
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
      message: CHANNEL_ROUTE_LOG.createFailureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: CHANNEL_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
