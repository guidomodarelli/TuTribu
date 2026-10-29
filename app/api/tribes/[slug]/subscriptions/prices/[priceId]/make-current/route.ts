/**
 * Handles current subscription price selection.
 *
 * @module tribe-subscription-price-current-route
 */

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import {
  createRouteJsonResponse,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";
import { handlePriceMemberRoute } from "../price-member-route";

const CURRENT_PRICE_ROUTE_LOG = {
  failureMessage: "Tribe subscription current price update failed",
  feature: "subscriptions",
  operation: "make-tribe-subscription-price-current",
} as const;

const CURRENT_PRICE_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés permisos para gestionar precios.",
  notFoundMessage: "No pudimos encontrar el precio.",
  successMessage: "Precio marcado como actual.",
  unauthorizedMessage: "Iniciá sesión para gestionar precios.",
  unexpectedMessage: "No pudimos marcar el precio como actual. Intentá de nuevo.",
} as const;

export async function POST(
  request: Request,
  context: TribeRouteContext<{ priceId: string }>
) {
  return handlePriceMemberRoute(
    request,
    context,
    { log: CURRENT_PRICE_ROUTE_LOG, response: CURRENT_PRICE_ROUTE_RESPONSE },
    async ({ modules, priceId, slug }) => {
      const result =
        await modules.subscriptions.useCases.makeTribeSubscriptionPriceCurrent({
          priceId,
          tribeSlug: slug,
        });

      switch (result.status) {
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.current:
          return createRouteJsonResponse(
            {
              message: CURRENT_PRICE_ROUTE_RESPONSE.successMessage,
              price: result.price,
            },
            HTTP_STATUS.ok
          );
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound:
          return createRouteJsonResponse(
            { message: CURRENT_PRICE_ROUTE_RESPONSE.notFoundMessage },
            HTTP_STATUS.notFound
          );
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden:
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled:
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.created:
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted:
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.hasLinkedInvitations:
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers:
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput:
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached:
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration:
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired:
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.updated:
        default:
          return createRouteJsonResponse(
            { message: CURRENT_PRICE_ROUTE_RESPONSE.forbiddenMessage },
            HTTP_STATUS.forbidden
          );
      }
    }
  );
}
