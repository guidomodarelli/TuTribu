/**
 * Handles Mercado Pago account label updates for tribe pricing.
 *
 * @module tribe-subscription-mercado-pago-account-route
 */

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { readStringField } from "@/app/api/request-body-fields";
import { HTTP_STATUS } from "@/app/api/route-http-status";

const MERCADO_PAGO_ACCOUNT_ROUTE_LOG = {
  feature: "subscriptions",
  updateFailureMessage: "Mercado Pago account label update failed",
  updateOperation: "update-mercado-pago-account-label",
} as const;

const MERCADO_PAGO_ACCOUNT_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés permisos para gestionar cuentas de Mercado Pago.",
  invalidInputMessage: "Definí un alias de cuenta válido.",
  notFoundMessage: "No pudimos encontrar la cuenta de Mercado Pago.",
  unauthorizedMessage: "Iniciá sesión para gestionar cuentas de Mercado Pago.",
  unexpectedMessage: "No pudimos actualizar el alias. Intentá de nuevo.",
  updatedMessage: "Alias actualizado.",
} as const;

const MERCADO_PAGO_ACCOUNT_ROUTE_FIELD = {
  accountLabel: "accountLabel",
} as const;

const MEMBER_ROUTE_SCOPE = {
  feature: MERCADO_PAGO_ACCOUNT_ROUTE_LOG.feature,
  operation: MERCADO_PAGO_ACCOUNT_ROUTE_LOG.updateOperation,
  unauthorizedMessage: MERCADO_PAGO_ACCOUNT_ROUTE_RESPONSE.unauthorizedMessage,
  withRequestId: true,
} as const;

export async function PATCH(
  request: Request,
  context: TribeRouteContext<{ paymentIntegrationId: string }>
) {
  const { paymentIntegrationId, slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: MERCADO_PAGO_ACCOUNT_ROUTE_LOG.updateFailureMessage,
      metadata: { paymentIntegrationId, slug },
      responseMessage: MERCADO_PAGO_ACCOUNT_ROUTE_RESPONSE.unexpectedMessage,
    },
    async ({ modules }) => {
      const body: unknown = await request.json().catch(() => null);
      const result =
        await modules.subscriptions.useCases.updateTribePaymentIntegrationAccountLabel({
          accountLabel: readStringField(
            body,
            MERCADO_PAGO_ACCOUNT_ROUTE_FIELD.accountLabel
          ),
          paymentIntegrationId,
          tribeSlug: slug,
        });

      switch (result.status) {
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.updated:
          return createRouteJsonResponse(
            {
              account: result.account,
              message: MERCADO_PAGO_ACCOUNT_ROUTE_RESPONSE.updatedMessage,
            },
            HTTP_STATUS.ok
          );
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput:
          return createRouteJsonResponse(
            { message: MERCADO_PAGO_ACCOUNT_ROUTE_RESPONSE.invalidInputMessage },
            HTTP_STATUS.badRequest
          );
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound:
          return createRouteJsonResponse(
            { message: MERCADO_PAGO_ACCOUNT_ROUTE_RESPONSE.notFoundMessage },
            HTTP_STATUS.notFound
          );
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden:
        case TRIBE_SUBSCRIPTION_PRICE_STATUS.connected:
        default:
          return createRouteJsonResponse(
            { message: MERCADO_PAGO_ACCOUNT_ROUTE_RESPONSE.forbiddenMessage },
            HTTP_STATUS.forbidden
          );
      }
    }
  );
}
