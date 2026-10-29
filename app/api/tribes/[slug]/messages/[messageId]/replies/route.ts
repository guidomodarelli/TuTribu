import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { isUuidRouteParam } from "@/src/modules/messages/infrastructure/http/message-route-params";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type RequestModules,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";

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

function readContentFromBody(body: unknown): string {
  if (!body || typeof body !== "object" || !(CREATE_REPLY_ROUTE_FIELD.content in body)) {
    return "";
  }

  const content = (body as Record<string, unknown>)[CREATE_REPLY_ROUTE_FIELD.content];

  return typeof content === "string" ? content : "";
}

export async function GET(
  request: Request,
  context: TribeRouteContext<{ messageId: string }>
) {
  const { messageId, slug } = await context.params;

  return handleMemberRoute(
    request,
    {
      feature: CREATE_REPLY_ROUTE_LOG.feature,
      operation: CREATE_REPLY_ROUTE_LOG.readOperation,
      unauthorizedMessage: CREATE_REPLY_ROUTE_RESPONSE.unauthorizedMessage,
    },
    {
      logMessage: CREATE_REPLY_ROUTE_LOG.listFailureMessage,
      metadata: { messageId, slug },
      responseMessage: CREATE_REPLY_ROUTE_RESPONSE.loadUnexpectedMessage,
    },
    async ({ member, modules }) => {
      if (!isUuidRouteParam(messageId)) {
        return createRouteJsonResponse(
          { message: CREATE_REPLY_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      }

      const result = await modules.messages.useCases.listMessageReplies({
        messageId,
        tribeSlug: slug,
        viewerId: member.id,
      });

      switch (result.status) {
        case LIST_MESSAGE_REPLIES_STATUS.found:
          return createRouteJsonResponse({ replies: result.replies }, HTTP_STATUS.ok);
        case MESSAGE_MUTATION_STATUS.notFound:
          return createRouteJsonResponse(
            { message: CREATE_REPLY_ROUTE_RESPONSE.notFoundMessage },
            HTTP_STATUS.notFound
          );
        case MESSAGE_MUTATION_STATUS.forbidden:
        default:
          return createRouteJsonResponse(
            { message: CREATE_REPLY_ROUTE_RESPONSE.forbiddenReadMessage },
            HTTP_STATUS.forbidden
          );
      }
    }
  );
}

type CreateMessageReplyResult = Awaited<
  ReturnType<RequestModules["messages"]["useCases"]["createMessageReply"]>
>;

function createPostResultResponse(result: CreateMessageReplyResult, slug: string): Response {
  switch (result.status) {
    case MESSAGE_MUTATION_STATUS.created:
      revalidateTribeRoundCache(slug);

      return createRouteJsonResponse(
        {
          reply: result.reply,
          message: CREATE_REPLY_ROUTE_RESPONSE.successMessage,
        },
        HTTP_STATUS.created
      );
    case MESSAGE_MUTATION_STATUS.invalidContent:
      return createRouteJsonResponse(
        { message: CREATE_REPLY_ROUTE_RESPONSE.invalidContentMessage },
        HTTP_STATUS.badRequest
      );
    case MESSAGE_MUTATION_STATUS.notFound:
      return createRouteJsonResponse(
        { message: CREATE_REPLY_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    case MESSAGE_MUTATION_STATUS.forbidden:
    default:
      return createRouteJsonResponse(
        { message: CREATE_REPLY_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
  }
}

export async function POST(
  request: Request,
  context: TribeRouteContext<{ messageId: string }>
) {
  const { messageId, slug } = await context.params;

  return handleMemberRoute(
    request,
    {
      feature: CREATE_REPLY_ROUTE_LOG.feature,
      operation: CREATE_REPLY_ROUTE_LOG.operation,
      unauthorizedMessage: CREATE_REPLY_ROUTE_RESPONSE.unauthorizedMessage,
    },
    {
      logMessage: CREATE_REPLY_ROUTE_LOG.createFailureMessage,
      metadata: { messageId, slug },
      responseMessage: CREATE_REPLY_ROUTE_RESPONSE.unexpectedMessage,
    },
    async ({ member, modules }) => {
      if (!isUuidRouteParam(messageId)) {
        return createRouteJsonResponse(
          { message: CREATE_REPLY_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      }

      const body: unknown = await request.json().catch(() => null);
      const result = await modules.messages.useCases.createMessageReply({
        authorId: member.id,
        tribeSlug: slug,
        content: readContentFromBody(body),
        messageId,
      });

      return createPostResultResponse(result, slug);
    }
  );
}
