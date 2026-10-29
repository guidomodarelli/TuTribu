/**
 * Handles Mercado Pago provider subscriber verification for one tribe price.
 *
 * @module tribe-subscription-provider-subscribers-verification-route
 */

import {
  TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
} from "@/src/modules/subscriptions/constants/subscriptions";
import {
  createRouteJsonResponse,
  type RequestModules,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { createProviderSyncFailureResponse } from "../../../provider-sync-route-responses";
import { HTTP_STATUS } from "@/app/api/route-http-status";
import { handlePriceMemberRoute } from "../price-member-route";

const PROVIDER_SUBSCRIBERS_VERIFICATION_ROUTE_LOG = {
  failureMessage: "Tribe subscription provider subscribers verification failed",
  feature: "subscriptions",
  operation: "reconcile-tribe-subscription-provider-subscribers",
} as const;

const PROVIDER_SUBSCRIBERS_VERIFICATION_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés permisos para verificar suscriptores.",
  missingIntegrationMessage:
    "Conectá Mercado Pago antes de verificar suscriptores.",
  notFoundMessage: "No pudimos encontrar el precio.",
  successMessage: "Suscriptores verificados con Mercado Pago.",
  unauthorizedMessage: "Iniciá sesión para verificar suscriptores.",
  unexpectedMessage:
    "No pudimos verificar los suscriptores. Intentá de nuevo.",
} as const;

type ReconcileTribeSubscriptionProviderSubscribersResult = Awaited<
  ReturnType<
    RequestModules["subscriptions"]["useCases"]["reconcileTribeSubscriptionProviderSubscribers"]
  >
>;

function createPostResultResponse(result: ReconcileTribeSubscriptionProviderSubscribersResult): Response {
  if (result.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.verified) {
    return createRouteJsonResponse(
      {
        message:
          PROVIDER_SUBSCRIBERS_VERIFICATION_ROUTE_RESPONSE.successMessage,
        price: result.price,
        providerActiveSubscribersCount:
          result.providerActiveSubscribersCount,
        verifiedCount: result.verifiedCount,
      },
      HTTP_STATUS.ok
    );
  }

  return createProviderSyncFailureResponse(result.status, PROVIDER_SUBSCRIBERS_VERIFICATION_ROUTE_RESPONSE);
}

/**
 * Reconciles real Mercado Pago subscribers for a tribe price.
 *
 * @param request - HTTP request carrying auth cookies and tracing headers.
 * @param context - Route params with the tribe slug and price id.
 * @returns Safe JSON response with the provider-backed subscriber count.
 */
export async function POST(
  request: Request,
  context: TribeRouteContext<{ priceId: string }>
) {
  return handlePriceMemberRoute(
    request,
    context,
    { log: PROVIDER_SUBSCRIBERS_VERIFICATION_ROUTE_LOG, response: PROVIDER_SUBSCRIBERS_VERIFICATION_ROUTE_RESPONSE, withRequestId: true },
    async ({ modules, priceId, slug }) => {
      const result =
        await modules.subscriptions.useCases
          .reconcileTribeSubscriptionProviderSubscribers({
            priceId,
            source: TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE.manualButton,
            tribeSlug: slug,
          });

      return createPostResultResponse(result);
    }
  );
}
