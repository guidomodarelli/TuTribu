/**
 * Handles manual subscriber diagnostics reconciliation for one tribe.
 *
 * @module tribe-subscriber-diagnostics-reconciliation-route
 */

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type RequestModules,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { createProviderSyncFailureResponse } from "../../provider-sync-route-responses";
import { HTTP_STATUS } from "@/app/api/route-http-status";

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

type ReconcileTribeSubscriberDiagnosticsResult = Awaited<
  ReturnType<RequestModules["subscriptions"]["useCases"]["reconcileTribeSubscriberDiagnostics"]>
>;

function createPostResultResponse(result: ReconcileTribeSubscriberDiagnosticsResult): Response {
  if (result.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.verified) {
    return createRouteJsonResponse(
      {
        diagnostics: result.diagnostics,
        message:
          SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_RESPONSE
            .successMessage,
        verifiedCount: result.verifiedCount,
      },
      HTTP_STATUS.ok
    );
  }

  return createProviderSyncFailureResponse(result.status, SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_RESPONSE);
}

const MEMBER_ROUTE_SCOPE = {
  feature: SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_LOG.feature,
  operation: SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_LOG.operation,
  unauthorizedMessage: SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_RESPONSE.unauthorizedMessage,
  withRequestId: true,
} as const;

/**
 * Reconciles aggregate subscriber diagnostics with Mercado Pago.
 *
 * @param request - HTTP request carrying auth cookies and tracing headers.
 * @param context - Route params with the tribe slug.
 * @returns Safe JSON response with aggregate subscriber diagnostics.
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
      logMessage: SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_LOG.failureMessage,
      metadata: { slug },
      responseMessage: SUBSCRIBER_DIAGNOSTICS_RECONCILIATION_ROUTE_RESPONSE.unexpectedMessage,
    },
    async ({ modules }) => {
      const result =
        await modules.subscriptions.useCases.reconcileTribeSubscriberDiagnostics({
          tribeSlug: slug,
        });

      return createPostResultResponse(result);
    }
  );
}
