/**
 * Handles tribe subscription price item deletion.
 *
 * @module tribe-subscription-price-route
 */

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const PRICE_ITEM_ROUTE_LOG = {
  deleteFailureMessage: "Tribe subscription price deletion failed",
  deleteOperation: "delete-tribe-subscription-price",
  feature: "subscriptions",
  updateOperation: "update-tribe-subscription-price",
  updateFailureMessage: "Tribe subscription price update failed",
} as const;

const PRICE_ITEM_ROUTE_RESPONSE = {
  canceledMessage: "Precio cancelado.",
  deletedMessage: "Precio eliminado.",
  forbiddenMessage: "No tenés permisos para gestionar precios.",
  hasSubscribersMessage: "No podés eliminar un precio con miembros asociados.",
  invalidInputMessage: "Definí un nombre y un precio mensual válido.",
  limitReachedMessage: "La tribu ya tiene 30 precios. Eliminá uno sin miembros para crear otro.",
  missingIntegrationMessage: "Conectá Mercado Pago antes de gestionar precios.",
  notFoundMessage: "No pudimos encontrar el precio.",
  unauthorizedMessage: "Iniciá sesión para gestionar precios.",
  unexpectedMessage: "No pudimos eliminar el precio. Intentá de nuevo.",
  unexpectedUpdateMessage: "No pudimos actualizar el precio. Intentá de nuevo.",
  updatedMessage: "Precio actualizado.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  serviceUnavailable: 503,
  unauthorized: 401,
} as const;

const PRICE_ITEM_ROUTE_FIELD = {
  amount: "amount",
  name: "name",
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
      priceId: string;
      slug: string;
    }>;
  }
) {
  const { priceId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: PRICE_ITEM_ROUTE_LOG.feature,
    operation: PRICE_ITEM_ROUTE_LOG.updateOperation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: PRICE_ITEM_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const result =
      await modules.subscriptions.useCases.updateTribeSubscriptionPrice({
        amount: readStringField(body, PRICE_ITEM_ROUTE_FIELD.amount),
        name: readStringField(body, PRICE_ITEM_ROUTE_FIELD.name),
        priceId,
        tribeSlug: slug,
      });

    switch (result.status) {
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.created:
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.current:
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.updated:
        return createJsonResponse(
          {
            message: PRICE_ITEM_ROUTE_RESPONSE.updatedMessage,
            price: result.price,
          },
          HTTP_STATUS.ok
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput:
        return createJsonResponse(
          { message: PRICE_ITEM_ROUTE_RESPONSE.invalidInputMessage },
          HTTP_STATUS.badRequest
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached:
        return createJsonResponse(
          { message: PRICE_ITEM_ROUTE_RESPONSE.limitReachedMessage },
          HTTP_STATUS.badRequest
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration:
        return createJsonResponse(
          { message: PRICE_ITEM_ROUTE_RESPONSE.missingIntegrationMessage },
          HTTP_STATUS.serviceUnavailable
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound:
        return createJsonResponse(
          { message: PRICE_ITEM_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: PRICE_ITEM_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: PRICE_ITEM_ROUTE_LOG.updateFailureMessage,
      error,
      metadata: {
        priceId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: PRICE_ITEM_ROUTE_RESPONSE.unexpectedUpdateMessage },
      HTTP_STATUS.serverError
    );
  }
}

export async function DELETE(
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
    feature: PRICE_ITEM_ROUTE_LOG.feature,
    operation: PRICE_ITEM_ROUTE_LOG.deleteOperation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: PRICE_ITEM_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const result =
      await modules.subscriptions.useCases.deleteTribeSubscriptionPrice({
        priceId,
        tribeSlug: slug,
      });

    switch (result.status) {
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled:
        return createJsonResponse(
          {
            message: PRICE_ITEM_ROUTE_RESPONSE.canceledMessage,
            price: result.price,
          },
          HTTP_STATUS.ok
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted:
        return createJsonResponse(
          {
            deletedPriceId: priceId,
            message: PRICE_ITEM_ROUTE_RESPONSE.deletedMessage,
          },
          HTTP_STATUS.ok
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers:
        return createJsonResponse(
          { message: PRICE_ITEM_ROUTE_RESPONSE.hasSubscribersMessage },
          HTTP_STATUS.badRequest
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration:
        return createJsonResponse(
          { message: PRICE_ITEM_ROUTE_RESPONSE.missingIntegrationMessage },
          HTTP_STATUS.serviceUnavailable
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound:
        return createJsonResponse(
          { message: PRICE_ITEM_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: PRICE_ITEM_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: PRICE_ITEM_ROUTE_LOG.deleteFailureMessage,
      error,
      metadata: {
        priceId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: PRICE_ITEM_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
