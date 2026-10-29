import { z } from "zod";

import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { revalidateTribeRoundCache } from "@/src/modules/messages/infrastructure/cache/tribe-round-cache-revalidation";
import { isUuidRouteParam } from "@/src/modules/messages/infrastructure/http/message-route-params";
import {
  handleMemberRoute,
  type RequestModules,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";

const TOGGLE_MESSAGE_LIKE_ROUTE_LOG = {
  feature: "messages",
  operation: "toggle-message-like",
  toggleFailureMessage: "Message like toggle failed",
} as const;

const TOGGLE_MESSAGE_LIKE_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para reaccionar a esta mensaje.",
  invalidBodyMessage: "No pudimos leer la reaccion. Recarga la pagina e intentalo de nuevo.",
  notFoundMessage: "No pudimos encontrar el mensaje.",
  successMessage: "Reaccion actualizada.",
  unexpectedMessage: "No pudimos actualizar la reaccion. Intentalo de nuevo.",
  unauthorizedMessage: "Inicia sesion para reaccionar.",
} as const;

/** Optional body: the desired state makes the write idempotent; no body keeps the historical toggle. */
const LIKE_BODY_SCHEMA = z.strictObject({ liked: z.boolean().optional() });

/**
 * Reads the optional desired state of the reaction.
 *
 * @param request - Native request whose body may be empty.
 * @returns The desired state; `undefined` when the body is empty, unreadable or has no `liked` (the historical toggle);
 * `null` when a body is present but is not a valid reaction.
 */
async function readDesiredLike(request: Request): Promise<boolean | undefined | null> {
  const body: unknown = await request.json().catch(() => undefined);
  if (body === undefined || body === null) return undefined;
  const parsed = LIKE_BODY_SCHEMA.safeParse(body);
  return parsed.success ? parsed.data.liked : null;
}

function createJsonResponse(
  body: Record<string, boolean | number | string>,
  status: number
): Response {
  return Response.json(body, { status });
}

type ToggleMessageLikeResult = Awaited<
  ReturnType<RequestModules["messages"]["useCases"]["toggleMessageLike"]>
>;

function createPostResultResponse(result: ToggleMessageLikeResult, slug: string): Response {
  switch (result.status) {
    case MESSAGE_MUTATION_STATUS.liked:
    case MESSAGE_MUTATION_STATUS.unliked:
      revalidateTribeRoundCache(slug);

      return createJsonResponse(
        {
          likedByViewer: result.likedByViewer,
          likeCount: result.likeCount,
          message: TOGGLE_MESSAGE_LIKE_ROUTE_RESPONSE.successMessage,
        },
        HTTP_STATUS.ok
      );
    case MESSAGE_MUTATION_STATUS.notFound:
      return createJsonResponse(
        { message: TOGGLE_MESSAGE_LIKE_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    case MESSAGE_MUTATION_STATUS.forbidden:
    default:
      return createJsonResponse(
        { message: TOGGLE_MESSAGE_LIKE_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
  }
}

const MEMBER_ROUTE_SCOPE = {
  feature: TOGGLE_MESSAGE_LIKE_ROUTE_LOG.feature,
  operation: TOGGLE_MESSAGE_LIKE_ROUTE_LOG.operation,
  unauthorizedMessage: TOGGLE_MESSAGE_LIKE_ROUTE_RESPONSE.unauthorizedMessage,
} as const;

export async function POST(
  request: Request,
  context: TribeRouteContext<{ messageId: string }>
) {
  const { messageId, slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: TOGGLE_MESSAGE_LIKE_ROUTE_LOG.toggleFailureMessage,
      metadata: { messageId, slug },
      responseMessage: TOGGLE_MESSAGE_LIKE_ROUTE_RESPONSE.unexpectedMessage,
    },
    async ({ member, modules }) => {
      if (!isUuidRouteParam(messageId)) {
        return createJsonResponse(
          { message: TOGGLE_MESSAGE_LIKE_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      }

      const liked = await readDesiredLike(request);

      if (liked === null) {
        return createJsonResponse(
          { message: TOGGLE_MESSAGE_LIKE_ROUTE_RESPONSE.invalidBodyMessage },
          HTTP_STATUS.badRequest
        );
      }

      const result = await modules.messages.useCases.toggleMessageLike({
        tribeSlug: slug,
        messageId,
        userId: member.id,
        ...(liked === undefined ? {} : { liked }),
      });

      return createPostResultResponse(result, slug);
    }
  );
}
