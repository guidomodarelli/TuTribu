/**
 * Handles manual subscriber diagnostics reconciliation for one tribe.
 *
 * @module tribe-subscriber-diagnostics-reconciliation-route
 */

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_LOG = {
  failureMessage: "Tribe subscriber diagnostics reconciliation failed",
  feature: "subscriptions",
  operation: "reconcile-tribe-subscriber-diagnostics",
} as const;

const SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés permisos para actualizar el diagnóstico.",
  missingIntegrationMessage:
    "Conectá Mercado Pago antes de actualizar el diagnóstico.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  successMessage: "Diagnóstico actualizado con Mercado Pago.",
  unauthorizedMessage: "Iniciá sesión para actualizar el diagnóstico.",
  unexpectedMessage:
    "No pudimos actualizar el diagnóstico. Intentá de nuevo.",
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
 * Reconciles aggregate subscriber diagnostics with Mercado Pago.
 *
 * @param request - HTTP request carrying auth cookies and tracing headers.
 * @param context - Route params with the tribe slug.
 * @returns Safe JSON response with aggregate subscriber diagnostics.
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
    feature: SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_LOG.feature,
    operation: SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      {
        message:
          SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_RESPONSE
            .unauthorizedMessage,
      },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const result =
      await modules.subscriptions.useCases.reconcileTribeSubscriberDiagnostics({
        tribeSlug: slug,
      });

    switch (result.status) {
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.verified:
        return createJsonResponse(
          {
            diagnostics: result.diagnostics,
            message:
              SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_RESPONSE
                .successMessage,
            verifiedCount: result.verifiedCount,
          },
          HTTP_STATUS.ok
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration:
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired:
        return createJsonResponse(
          {
            message:
              SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_RESPONSE
                .missingIntegrationMessage,
          },
          HTTP_STATUS.serviceUnavailable
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound:
        return createJsonResponse(
          {
            message:
              SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_RESPONSE
                .notFoundMessage,
          },
          HTTP_STATUS.notFound
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden:
      default:
        return createJsonResponse(
          {
            message:
              SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_RESPONSE
                .forbiddenMessage,
          },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_LOG.failureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      {
        message:
          SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_RESPONSE
            .unexpectedMessage,
      },
      HTTP_STATUS.serverError
    );
  }
}
