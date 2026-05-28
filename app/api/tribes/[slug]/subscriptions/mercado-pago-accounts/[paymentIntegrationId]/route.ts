/**
 * Handles Mercado Pago account label updates for tribe pricing.
 *
 * @module tribe-subscription-mercado-pago-account-route
 */

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

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

const HTTP_STATUS = {
  badRequest: 400,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

const MERCADO_PAGO_ACCOUNT_ROUTE_FIELD = {
  accountLabel: "accountLabel",
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
 * Reads a string field from an unknown JSON body.
 *
 * @param body - Parsed JSON body.
 * @param field - Field name to read.
 * @returns String field value or an empty string.
 */
function readStringField(body: unknown, field: string): string {
  if (!body || typeof body !== "object" || !(field in body)) {
    return "";
  }

  const value = (body as Record<string, unknown>)[field];

  return typeof value === "string" ? value : "";
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      paymentIntegrationId: string;
      slug: string;
    }>;
  }
) {
  const { paymentIntegrationId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: MERCADO_PAGO_ACCOUNT_ROUTE_LOG.feature,
    operation: MERCADO_PAGO_ACCOUNT_ROUTE_LOG.updateOperation,
    requestId,
  });
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: MERCADO_PAGO_ACCOUNT_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const body = await request.json().catch(() => null);
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
        return createJsonResponse(
          {
            account: result.account,
            message: MERCADO_PAGO_ACCOUNT_ROUTE_RESPONSE.updatedMessage,
          },
          HTTP_STATUS.ok
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput:
        return createJsonResponse(
          { message: MERCADO_PAGO_ACCOUNT_ROUTE_RESPONSE.invalidInputMessage },
          HTTP_STATUS.badRequest
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound:
        return createJsonResponse(
          { message: MERCADO_PAGO_ACCOUNT_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: MERCADO_PAGO_ACCOUNT_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: MERCADO_PAGO_ACCOUNT_ROUTE_LOG.updateFailureMessage,
      error,
      metadata: {
        paymentIntegrationId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: MERCADO_PAGO_ACCOUNT_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
