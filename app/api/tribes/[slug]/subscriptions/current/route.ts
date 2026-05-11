/**
 * Handles current member subscription self-management.
 *
 * @module tribe-current-member-subscription-route
 */

import { TRIBE_MEMBER_SUBSCRIPTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const CURRENT_SUBSCRIPTION_ROUTE_LOG = {
  cancelFailureMessage: "Current member subscription cancellation failed",
  feature: "subscriptions",
  operation: "cancel-current-member-subscription",
} as const;

const CURRENT_SUBSCRIPTION_ROUTE_RESPONSE = {
  canceledMessage: "Cancelamos tu suscripción.",
  notFoundMessage: "No encontramos una suscripción vigente para cancelar.",
  providerUnavailableMessage:
    "No pudimos contactar a Mercado Pago. Intentá de nuevo más tarde.",
  unauthorizedMessage: "Iniciá sesión para gestionar tu suscripción.",
  unexpectedMessage: "No pudimos cancelar la suscripción. Intentá de nuevo.",
} as const;

const HTTP_STATUS = {
  notFound: 404,
  ok: 200,
  serverError: 500,
  serviceUnavailable: 503,
  unauthorized: 401,
} as const;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

export async function DELETE(
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
    feature: CURRENT_SUBSCRIPTION_ROUTE_LOG.feature,
    operation: CURRENT_SUBSCRIPTION_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules({
    mercadoPagoWebhookVerified: true,
  });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: CURRENT_SUBSCRIPTION_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const result =
      await modules.subscriptions.useCases.cancelOwnTribeMemberSubscription({
        tribeSlug: slug,
      });

    switch (result.status) {
      case TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled:
        return createJsonResponse(
          { message: CURRENT_SUBSCRIPTION_ROUTE_RESPONSE.canceledMessage },
          HTTP_STATUS.ok
        );
      case TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable:
        return createJsonResponse(
          {
            message:
              CURRENT_SUBSCRIPTION_ROUTE_RESPONSE.providerUnavailableMessage,
          },
          HTTP_STATUS.serviceUnavailable
        );
      case TRIBE_MEMBER_SUBSCRIPTION_STATUS.notFound:
      default:
        return createJsonResponse(
          { message: CURRENT_SUBSCRIPTION_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
    }
  } catch (error) {
    logger.error({
      message: CURRENT_SUBSCRIPTION_ROUTE_LOG.cancelFailureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: CURRENT_SUBSCRIPTION_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
