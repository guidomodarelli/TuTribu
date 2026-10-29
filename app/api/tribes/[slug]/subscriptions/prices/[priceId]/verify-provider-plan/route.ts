/**
 * Handles Mercado Pago provider plan verification for one tribe price.
 *
 * @module tribe-subscription-provider-plan-verification-route
 */

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type RequestModules,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { createProviderSyncFailureResponse } from "../../../provider-sync-route-responses";
import { HTTP_STATUS } from "@/app/api/route-http-status";

const PROVIDER_PLAN_VERIFICATION_ROUTE_LOG = {
  failureMessage: "Tribe subscription provider plan verification failed",
  feature: "subscriptions",
  operation: "verify-tribe-subscription-provider-plan",
} as const;

const PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés permisos para verificar planes.",
  missingIntegrationMessage: "Conectá Mercado Pago antes de verificar planes.",
  notFoundMessage: "No pudimos encontrar el precio.",
  canceledMessage: "El plan figura cancelado en Mercado Pago.",
  successMessage: "El plan sigue vigente en Mercado Pago.",
  unauthorizedMessage: "Iniciá sesión para verificar planes.",
  unexpectedMessage: "No pudimos verificar los planes. Intentá de nuevo.",
} as const;

type VerifyTribeSubscriptionProviderPlanResult = Awaited<
  ReturnType<RequestModules["subscriptions"]["useCases"]["verifyTribeSubscriptionProviderPlan"]>
>;

function createPostResultResponse(result: VerifyTribeSubscriptionProviderPlanResult): Response {
  if (result.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.verified) {
    return createRouteJsonResponse(
      {
        ...(typeof result.freeJoinIsCurrent === "boolean"
          ? { freeJoinIsCurrent: result.freeJoinIsCurrent }
          : {}),
        message:
          result.price.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled
            ? PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE.canceledMessage
            : PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE.successMessage,
        price: result.price,
      },
      HTTP_STATUS.ok
    );
  }

  return createProviderSyncFailureResponse(
    result.status,
    PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE
  );
}

const MEMBER_ROUTE_SCOPE = {
  feature: PROVIDER_PLAN_VERIFICATION_ROUTE_LOG.feature,
  operation: PROVIDER_PLAN_VERIFICATION_ROUTE_LOG.operation,
  unauthorizedMessage: PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE.unauthorizedMessage,
  withRequestId: true,
} as const;

/**
 * Verifies one active provider plan for a tribe price.
 *
 * @param request - HTTP request carrying auth cookies and tracing headers.
 * @param context - Route params with the tribe slug and price id.
 * @returns Safe JSON response with the verified price or error message.
 */
export async function POST(
  request: Request,
  context: TribeRouteContext<{ priceId: string }>
) {
  const { priceId, slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: PROVIDER_PLAN_VERIFICATION_ROUTE_LOG.failureMessage,
      metadata: { priceId, slug },
      responseMessage: PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE.unexpectedMessage,
    },
    async ({ modules }) => {
      const result =
        await modules.subscriptions.useCases.verifyTribeSubscriptionProviderPlan({
          priceId,
          tribeSlug: slug,
        });

      return createPostResultResponse(result);
    }
  );
}
