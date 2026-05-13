import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { isUuidRouteParam } from "@/src/modules/messages/infrastructure/http/message-route-params";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const CREATE_REPLY_ROUTE_FIELD = {
  content: "content",
} as const;

const CREATE_REPLY_ROUTE_LOG = {
  createFailureMessage: "Message reply creation failed",
  feature: "messages",
  listFailureMessage: "Message replies listing failed",
  operation: "create-message-reply",
  readOperation: "list-message-replies",
} as const;

const CREATE_REPLY_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para responder esta mensaje.",
  forbiddenReadMessage: "No tenes permisos para ver las respuestas de este mensaje.",
  invalidContentMessage: "Escribi una respuesta antes de enviarlo.",
  loadUnexpectedMessage: "No pudimos cargar las respuestas. Intentalo de nuevo.",
  notFoundMessage: "No pudimos encontrar el mensaje.",
  successMessage: "Respuesta creado.",
  unexpectedMessage: "No pudimos crear la respuesta. Intentalo de nuevo.",
  unauthorizedMessage: "Inicia sesion para responder.",
} as const;

const LIST_MESSAGE_REPLIES_STATUS = {
  found: "found",
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

function readContentFromBody(body: unknown): string {
  if (!body || typeof body !== "object" || !(CREATE_REPLY_ROUTE_FIELD.content in body)) {
    return "";
  }

  const content = (body as Record<string, unknown>)[CREATE_REPLY_ROUTE_FIELD.content];

  return typeof content === "string" ? content : "";
}

export async function GET(
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
    feature: CREATE_REPLY_ROUTE_LOG.feature,
    operation: CREATE_REPLY_ROUTE_LOG.readOperation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: CREATE_REPLY_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  if (!isUuidRouteParam(messageId)) {
    return createJsonResponse(
      { message: CREATE_REPLY_ROUTE_RESPONSE.notFoundMessage },
      HTTP_STATUS.notFound
    );
  }

  try {
    const result = await modules.messages.useCases.listMessageReplies({
      messageId,
      tribeSlug: slug,
      viewerId: authenticatedMember.id,
    });

    switch (result.status) {
      case LIST_MESSAGE_REPLIES_STATUS.found:
        return createJsonResponse({ replies: result.replies }, HTTP_STATUS.ok);
      case MESSAGE_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: CREATE_REPLY_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case MESSAGE_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: CREATE_REPLY_ROUTE_RESPONSE.forbiddenReadMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: CREATE_REPLY_ROUTE_LOG.listFailureMessage,
      error,
      metadata: {
        messageId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: CREATE_REPLY_ROUTE_RESPONSE.loadUnexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}

export async function POST(
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
    feature: CREATE_REPLY_ROUTE_LOG.feature,
    operation: CREATE_REPLY_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: CREATE_REPLY_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  if (!isUuidRouteParam(messageId)) {
    return createJsonResponse(
      { message: CREATE_REPLY_ROUTE_RESPONSE.notFoundMessage },
      HTTP_STATUS.notFound
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const result = await modules.messages.useCases.createMessageReply({
      authorId: authenticatedMember.id,
      tribeSlug: slug,
      content: readContentFromBody(body),
      messageId,
    });

    switch (result.status) {
      case MESSAGE_MUTATION_STATUS.created:
        revalidateTribeRoundCache(slug);

        return createJsonResponse(
          {
            reply: result.reply,
            message: CREATE_REPLY_ROUTE_RESPONSE.successMessage,
          },
          HTTP_STATUS.created
        );
      case MESSAGE_MUTATION_STATUS.invalidContent:
        return createJsonResponse(
          { message: CREATE_REPLY_ROUTE_RESPONSE.invalidContentMessage },
          HTTP_STATUS.badRequest
        );
      case MESSAGE_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: CREATE_REPLY_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case MESSAGE_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: CREATE_REPLY_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: CREATE_REPLY_ROUTE_LOG.createFailureMessage,
      error,
      metadata: {
        messageId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: CREATE_REPLY_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
