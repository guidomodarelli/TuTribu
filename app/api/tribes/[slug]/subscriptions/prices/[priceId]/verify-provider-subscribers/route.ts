/**
 * Handles Mercado Pago provider subscriber verification for one tribe price.
 *
 * @module tribe-subscription-provider-subscribers-verification-route
 */

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const PROVIDER_SUBSCRIBERS_VERIFICATION_ROUTE_LOG = {
  failureMessage: "Tribe subscription provider subscribers verification failed",
  feature: "subscriptions",
  operation: "verify-tribe-subscription-provider-subscribers",
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
 * Verifies real Mercado Pago subscribers for a tribe price.
 *
 * @param request - HTTP request carrying auth cookies and tracing headers.
 * @param context - Route params with the tribe slug and price id.
 * @returns Safe JSON response with the provider-backed subscriber count.
 */
export async function POST(
  request: Request,
  context: {
    params: Promise<{
      priceId: string;
      slug: string;
    }>;
  }
) {
  const { priceId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: PROVIDER_SUBSCRIBERS_VERIFICATION_ROUTE_LOG.feature,
    operation: PROVIDER_SUBSCRIBERS_VERIFICATION_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      {
        message:
          PROVIDER_SUBSCRIBERS_VERIFICATION_ROUTE_RESPONSE.unauthorizedMessage,
      },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const result =
      await modules.subscriptions.useCases
        .verifyTribeSubscriptionProviderSubscribers({
          priceId,
          tribeSlug: slug,
        });

    switch (result.status) {
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.verified:
        return createJsonResponse(
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
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration:
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired:
        return createJsonResponse(
          {
            message:
              PROVIDER_SUBSCRIBERS_VERIFICATION_ROUTE_RESPONSE
                .missingIntegrationMessage,
          },
          HTTP_STATUS.serviceUnavailable
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound:
        return createJsonResponse(
          {
            message: PROVIDER_SUBSCRIBERS_VERIFICATION_ROUTE_RESPONSE.notFoundMessage,
          },
          HTTP_STATUS.notFound
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden:
      default:
        return createJsonResponse(
          {
            message: PROVIDER_SUBSCRIBERS_VERIFICATION_ROUTE_RESPONSE.forbiddenMessage,
          },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: PROVIDER_SUBSCRIBERS_VERIFICATION_ROUTE_LOG.failureMessage,
      error,
      metadata: {
        priceId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: PROVIDER_SUBSCRIBERS_VERIFICATION_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
