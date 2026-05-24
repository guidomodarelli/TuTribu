/**
 * Handles Mercado Pago provider plan verification for tribe prices.
 *
 * @module tribe-subscription-provider-plans-verification-route
 */

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

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

const HTTP_STATUS = {
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  serviceUnavailable: 503,
  unauthorized: 401,
} as const;

/**
 * Creates a JSON response with an explicit status.
 *
 * @param body - JSON body.
 * @param status - HTTP status.
 * @returns JSON response.
 */
function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

/**
 * Verifies all active provider plans for a tribe.
 *
 * @param request - HTTP request carrying auth cookies and tracing headers.
 * @param context - Route params with the tribe slug.
 * @returns Safe JSON response with the refreshed prices or an error message.
 */
export async function POST(
  request: Request,
  context: {
    params: Promise<{
      slug: string;
    }>;
  }
) {
  const { slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: PROVIDER_PLAN_VERIFICATION_ROUTE_LOG.feature,
    operation: PROVIDER_PLAN_VERIFICATION_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const result =
      await modules.subscriptions.useCases.verifyTribeSubscriptionProviderPlans({
        tribeSlug: slug,
      });

    switch (result.status) {
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.verified:
        return createJsonResponse(
          {
            message: PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE.successMessage,
            canceledPriceIds: result.canceledPriceIds,
            freeJoinIsCurrent: result.freeJoinIsCurrent,
            prices: result.prices,
            verifiedCount: result.verifiedCount,
          },
          HTTP_STATUS.ok
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration:
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired:
        return createJsonResponse(
          {
            message:
              PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE.missingIntegrationMessage,
          },
          HTTP_STATUS.serviceUnavailable
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound:
        return createJsonResponse(
          { message: PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: PROVIDER_PLAN_VERIFICATION_ROUTE_LOG.failureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: PROVIDER_PLAN_VERIFICATION_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
