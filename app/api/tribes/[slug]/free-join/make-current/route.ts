/**
 * Marks the synthetic free-join option as the tribe's current offering.
 *
 * @module tribe-free-join-current-route
 */

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";

const FREE_JOIN_ROUTE_LOG = {
  failureMessage: "Tribe free-join current toggle failed",
  feature: "subscriptions",
  operation: "set-tribe-free-join-as-current",
} as const;

const FREE_JOIN_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés permisos para gestionar precios.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  successMessage: "Entrada gratis marcada como actual.",
  unauthorizedMessage: "Iniciá sesión para gestionar precios.",
  unexpectedMessage:
    "No pudimos marcar la entrada gratis como actual. Intentá de nuevo.",
} as const;

const MEMBER_ROUTE_SCOPE = {
  feature: FREE_JOIN_ROUTE_LOG.feature,
  operation: FREE_JOIN_ROUTE_LOG.operation,
  unauthorizedMessage: FREE_JOIN_ROUTE_RESPONSE.unauthorizedMessage,
} as const;

export async function POST(
  request: Request,
  context: TribeRouteContext
) {
  const { slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: FREE_JOIN_ROUTE_LOG.failureMessage,
      metadata: { slug },
      responseMessage: FREE_JOIN_ROUTE_RESPONSE.unexpectedMessage,
    },
    async ({ modules }) => {
      const result = await modules.subscriptions.useCases.setTribeFreeJoinAsCurrent({
        tribeSlug: slug,
      });

      switch (result.status) {
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.current:
          return createRouteJsonResponse(
            { message: FREE_JOIN_ROUTE_RESPONSE.successMessage },
            HTTP_STATUS.ok
          );
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound:
          return createRouteJsonResponse(
            { message: FREE_JOIN_ROUTE_RESPONSE.notFoundMessage },
            HTTP_STATUS.notFound
          );
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden:
        default:
          return createRouteJsonResponse(
            { message: FREE_JOIN_ROUTE_RESPONSE.forbiddenMessage },
            HTTP_STATUS.forbidden
          );
      }
    }
  );
}
