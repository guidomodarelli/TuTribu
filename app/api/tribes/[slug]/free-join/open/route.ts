/**
 * Toggles the tokenless free open join for a free tribe. It lives next to the
 * free-join current toggle because both answer the same product question: how
 * members get in.
 *
 * @module tribe-open-free-join-route
 */

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { revalidateTribeStoryAboutCache } from "@/src/modules/tribes/infrastructure/cache/tribe-story-about-cache-revalidation";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";
import { isPayloadObject } from "@/app/api/request-body-fields";

const OPEN_FREE_JOIN_ROUTE_LOG = {
  failureMessage: "Tribe open free join toggle failed",
  feature: "subscriptions",
  operation: "set-tribe-open-free-join",
} as const;

const OPEN_FREE_JOIN_ROUTE_RESPONSE = {
  disabledMessage: "La entrada abierta quedó desactivada.",
  enabledMessage: "La entrada abierta quedó activada.",
  forbiddenMessage: "Solo el líder puede cambiar cómo se une la gente.",
  invalidBodyMessage: "Revisá la opción antes de guardar.",
  unauthorizedMessage: "Iniciá sesión para gestionar precios.",
  unexpectedMessage: "No pudimos guardar el cambio. Intentá de nuevo.",
} as const;

const MEMBER_ROUTE_SCOPE = {
  feature: OPEN_FREE_JOIN_ROUTE_LOG.feature,
  operation: OPEN_FREE_JOIN_ROUTE_LOG.operation,
  unauthorizedMessage: OPEN_FREE_JOIN_ROUTE_RESPONSE.unauthorizedMessage,
} as const;

export async function PUT(
  request: Request,
  context: TribeRouteContext
) {
  const { slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: OPEN_FREE_JOIN_ROUTE_LOG.failureMessage,
      metadata: { slug },
      responseMessage: OPEN_FREE_JOIN_ROUTE_RESPONSE.unexpectedMessage,
    },
    async ({ modules }) => {
      const parsedBody: unknown = await request.json().catch(() => ({}));

      if (
        !isPayloadObject(parsedBody) ||
        typeof parsedBody.enabled !== "boolean"
      ) {
        return createRouteJsonResponse(
          { message: OPEN_FREE_JOIN_ROUTE_RESPONSE.invalidBodyMessage },
          HTTP_STATUS.badRequest
        );
      }

      const enabled = parsedBody.enabled;
      const result = await modules.subscriptions.useCases.setTribeOpenFreeJoin({
        enabled,
        tribeSlug: slug,
      });

      if (result.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.current) {
        revalidateTribeStoryAboutCache(slug);

        return createRouteJsonResponse(
          {
            message: enabled
              ? OPEN_FREE_JOIN_ROUTE_RESPONSE.enabledMessage
              : OPEN_FREE_JOIN_ROUTE_RESPONSE.disabledMessage,
            openFreeJoinEnabled: enabled,
          },
          HTTP_STATUS.ok
        );
      }

      return createRouteJsonResponse(
        { message: OPEN_FREE_JOIN_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
    }
  );
}
