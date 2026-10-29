/**
 * Handles Mercado Pago provider plan verification for tribe prices.
 *
 * @module tribe-subscription-provider-plans-verification-route
 */

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { createProviderSyncFailureResponse } from "../../provider-sync-route-responses";
import { HTTP_STATUS } from "@/app/api/route-http-status";

const PROVIDER_PLAN_VERIFICATION_ROUTE_LOG = {
  failureMessage: "Tribe subscription provider plans verification failed",
  feature: "subscriptions",
  operation: "verify-tribe-subscription-provider-plans",
} as const;

const PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés permisos para verificar planes.",
  missingIntegrationMessage: "Conectá Mercado Pago antes de verificar planes.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  successMessage: "Planes verificados con Mercado Pago.",
  unauthorizedMessage: "Iniciá sesión para verificar planes.",
  unexpectedMessage: "No pudimos verificar los planes. Intentá de nuevo.",
} as const;

const MEMBER_ROUTE_SCOPE = {
  feature: PROVIDER_PLAN_VERIFICATION_ROUTE_LOG.feature,
  operation: PROVIDER_PLAN_VERIFICATION_ROUTE_LOG.operation,
  unauthorizedMessage: PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE.unauthorizedMessage,
  withRequestId: true,
} as const;

/**
 * Verifies all active provider plans for a tribe.
 *
 * @param request - HTTP request carrying auth cookies and tracing headers.
 * @param context - Route params with the tribe slug.
 * @returns Safe JSON response with the refreshed prices or an error message.
 */
export async function POST(
  request: Request,
  context: TribeRouteContext
) {
  const { slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: PROVIDER_PLAN_VERIFICATION_ROUTE_LOG.failureMessage,
      metadata: { slug },
      responseMessage: PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE.unexpectedMessage,
    },
    async ({ modules }) => {
      const result =
        await modules.subscriptions.useCases.verifyTribeSubscriptionProviderPlans({
          tribeSlug: slug,
        });

      if (result.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.verified) {
        return createRouteJsonResponse(
          {
            message: PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE.successMessage,
            canceledPriceIds: result.canceledPriceIds,
            freeJoinIsCurrent: result.freeJoinIsCurrent,
            prices: result.prices,
            verifiedCount: result.verifiedCount,
          },
          HTTP_STATUS.ok
        );
      }

      return createProviderSyncFailureResponse(
        result.status,
        PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE
      );
    }
  );
}
