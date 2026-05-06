/**
 * Handles tribe subscription price collection requests.
 *
 * @module tribe-subscription-prices-route
 */

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const PRICE_ROUTE_FIELD = {
  amount: "amount",
  name: "name",
} as const;

const PRICE_ROUTE_LOG = {
  createFailureMessage: "Tribe subscription price creation failed",
  feature: "subscriptions",
  listFailureMessage: "Tribe subscription price listing failed",
  operation: "manage-tribe-subscription-prices",
} as const;

const PRICE_ROUTE_RESPONSE = {
  createdMessage: "Precio creado.",
  forbiddenMessage: "No tenés permisos para gestionar precios.",
  invalidInputMessage: "Definí un nombre y un precio mensual válido.",
  limitReachedMessage: "La tribu ya tiene 30 precios. Eliminá uno sin miembros para crear otro.",
  missingIntegrationMessage: "Conectá Mercado Pago antes de crear precios.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  unauthorizedMessage: "Iniciá sesión para gestionar precios.",
  unexpectedCreateMessage: "No pudimos crear el precio. Intentá de nuevo.",
  unexpectedListMessage: "No pudimos cargar los precios. Intentá de nuevo.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  created: 201,
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

export async function GET(
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
    feature: PRICE_ROUTE_LOG.feature,
    operation: PRICE_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: PRICE_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    return createJsonResponse(
      await modules.subscriptions.useCases.listTribeSubscriptionPrices({
        tribeSlug: slug,
      }),
      HTTP_STATUS.ok
    );
  } catch (error) {
    logger.error({
      message: PRICE_ROUTE_LOG.listFailureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: PRICE_ROUTE_RESPONSE.unexpectedListMessage },
      HTTP_STATUS.serverError
    );
  }
}

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
    feature: PRICE_ROUTE_LOG.feature,
    operation: PRICE_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: PRICE_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const result = await modules.subscriptions.useCases.createTribeSubscriptionPrice({
      amount: readStringField(body, PRICE_ROUTE_FIELD.amount),
      name: readStringField(body, PRICE_ROUTE_FIELD.name),
      tribeSlug: slug,
    });

    switch (result.status) {
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.created:
        return createJsonResponse(
          {
            message: PRICE_ROUTE_RESPONSE.createdMessage,
            price: result.price,
          },
          HTTP_STATUS.created
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput:
        return createJsonResponse(
          { message: PRICE_ROUTE_RESPONSE.invalidInputMessage },
          HTTP_STATUS.badRequest
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached:
        return createJsonResponse(
          { message: PRICE_ROUTE_RESPONSE.limitReachedMessage },
          HTTP_STATUS.badRequest
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration:
        return createJsonResponse(
          { message: PRICE_ROUTE_RESPONSE.missingIntegrationMessage },
          HTTP_STATUS.serviceUnavailable
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound:
        return createJsonResponse(
          { message: PRICE_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: PRICE_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: PRICE_ROUTE_LOG.createFailureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: PRICE_ROUTE_RESPONSE.unexpectedCreateMessage },
      HTTP_STATUS.serverError
    );
  }
}
