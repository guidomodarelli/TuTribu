import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import {
  createRouteJsonResponse,
  type RequestModules,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";
import { handleMessageMemberRoute } from "../message-member-route";

const TOGGLE_MESSAGE_PIN_ROUTE_LOG = {
  feature: "messages",
  operation: "toggle-message-pin",
  failureMessage: "Message pin toggle failed",
} as const;

const TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para pinear este mensaje.",
  limitReachedMessage: "Solo podes pinear hasta 3 mensajes en el fogón.",
  notFoundMessage: "No pudimos encontrar el mensaje.",
  pinnedMessage: "Mensaje pineado.",
  unexpectedMessage: "No pudimos actualizar el pin. Intentalo de nuevo.",
  unauthorizedMessage: "Inicia sesion para pinear mensajes.",
  unpinnedMessage: "Mensaje despineado.",
} as const;

type ToggleMessagePinResult = Awaited<
  ReturnType<RequestModules["messages"]["useCases"]["toggleMessagePin"]>
>;

function createPostResultResponse(result: ToggleMessagePinResult, slug: string): Response {
  switch (result.status) {
    case MESSAGE_MUTATION_STATUS.pinned:
      revalidateTribeRoundCache(slug);

      return createRouteJsonResponse(
        {
          isPinned: true,
          message: TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE.pinnedMessage,
          pinnedAt: result.pinnedAt,
        },
        HTTP_STATUS.ok
      );
    case MESSAGE_MUTATION_STATUS.unpinned:
      revalidateTribeRoundCache(slug);

      return createRouteJsonResponse(
        {
          isPinned: false,
          message: TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE.unpinnedMessage,
          pinnedAt: null,
        },
        HTTP_STATUS.ok
      );
    case MESSAGE_MUTATION_STATUS.pinLimitReached:
      return createRouteJsonResponse(
        { message: TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE.limitReachedMessage },
        HTTP_STATUS.conflict
      );
    case MESSAGE_MUTATION_STATUS.notFound:
      return createRouteJsonResponse(
        { message: TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    case MESSAGE_MUTATION_STATUS.forbidden:
    default:
      return createRouteJsonResponse(
        { message: TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
  }
}

export async function POST(
  request: Request,
  context: TribeRouteContext<{ messageId: string }>
) {
  return handleMessageMemberRoute(
    request,
    context,
    { log: TOGGLE_MESSAGE_PIN_ROUTE_LOG, response: TOGGLE_MESSAGE_PIN_ROUTE_RESPONSE },
    async ({ member, messageId, modules, slug }) => {
      const result = await modules.messages.useCases.toggleMessagePin({
        messageId,
        tribeSlug: slug,
        userId: member.id,
      });

      return createPostResultResponse(result, slug);
    }
  );
}
