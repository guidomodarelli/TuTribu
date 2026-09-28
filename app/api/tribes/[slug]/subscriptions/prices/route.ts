/**
 * Handles tribe subscription price collection requests.
 *
 * @module tribe-subscription-prices-route
 */

import {
  TRIBE_SUBSCRIPTION_PRICE_MINIMUM_AMOUNT_CENTS,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
  TRIBE_SUBSCRIPTION_TRIAL_MAXIMUM_DAYS,
  TRIBE_SUBSCRIPTION_TRIAL_MINIMUM_DAYS,
} from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const PRICE_ROUTE_FIELD = {
  amount: "amount",
  name: "name",
  paymentIntegrationId: "paymentIntegrationId",
  productKey: "productKey",
  trialFrequency: "trialFrequency",
  trialFrequencyType: "trialFrequencyType",
} as const;

const PRICE_ROUTE_AMOUNT = {
  centsMultiplier: 100,
  commaSeparator: ",",
  dotSeparator: ".",
  validPattern: /^\d+(\.\d{1,2})?$/,
} as const;

const PRICE_ROUTE_TRIAL = {
  daysType: "days",
  validPattern: /^\d+$/,
} as const;

const PRICE_ROUTE_LOG = {
  createFailureMessage: "Tribe subscription price creation failed",
  feature: "subscriptions",
  listFailureMessage: "Tribe subscription price listing failed",
  operation: "manage-tribe-subscription-prices",
} as const;

const PRICE_ROUTE_RESPONSE = {
  amountMinimumFieldMessage: "El precio mensual mínimo es $ 15.",
  createdMessage: "Precio creado.",
  forbiddenMessage: "No tenés permisos para gestionar precios.",
  invalidInputMessage: "Definí un nombre y un precio mensual válido.",
  invalidTrialFieldMessage:
    "La prueba gratis debe ser de entre 1 y 14 días.",
  invalidTrialInputMessage:
    "Definí un nombre, un precio mensual y una prueba gratis válidos.",
  limitReachedMessage: "La tribu ya tiene 30 precios. Eliminá uno sin miembros para crear otro.",
  missingIntegrationMessage: "Conectá Mercado Pago antes de crear precios.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  unauthorizedMessage: "Iniciá sesión para gestionar precios.",
  unexpectedCreateMessage: "No pudimos crear el precio. Intentá de nuevo.",
  unexpectedListMessage: "No pudimos cargar los precios. Intentá de nuevo.",
} as const;

const MERCADO_PAGO_PRICE_REJECTION = {
  minimumAmountMessage: "Cannot pay an amount lower than $ 15.00",
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

/**
 * Reads an optional string field without collapsing omitted fields.
 *
 * @param body - Parsed JSON body.
 * @param field - Field name to read.
 * @returns String field value, an empty string for invalid provided values, or undefined when omitted.
 */
function readOptionalStringField(
  body: unknown,
  field: string
): string | undefined {
  if (!body || typeof body !== "object" || !(field in body)) {
    return undefined;
  }

  const value = (body as Record<string, unknown>)[field];

  return typeof value === "string" ? value : "";
}

/**
 * Creates the safe response used for amount validation failures.
 *
 * @returns JSON body with form field errors.
 */
function createInvalidPriceAmountResponse(): Record<string, unknown> {
  return {
    fieldErrors: {
      [PRICE_ROUTE_FIELD.amount]: PRICE_ROUTE_RESPONSE.amountMinimumFieldMessage,
    },
    message: PRICE_ROUTE_RESPONSE.invalidInputMessage,
  };
}

/**
 * Creates the safe response used for trial validation failures.
 *
 * @returns JSON body with form field errors.
 */
function createInvalidTrialFrequencyResponse(): Record<string, unknown> {
  return {
    fieldErrors: {
      [PRICE_ROUTE_FIELD.trialFrequency]:
        PRICE_ROUTE_RESPONSE.invalidTrialFieldMessage,
    },
    message: PRICE_ROUTE_RESPONSE.invalidTrialInputMessage,
  };
}

/**
 * Converts a submitted route amount into cents when it has a valid shape.
 *
 * @param amount - Raw amount submitted by the form.
 * @returns Amount in cents, or null when the route cannot classify it.
 */
function parseRouteAmountCents(amount: string): number | null {
  const normalizedAmount = amount
    .trim()
    .replace(
      PRICE_ROUTE_AMOUNT.commaSeparator,
      PRICE_ROUTE_AMOUNT.dotSeparator
    );

  if (!PRICE_ROUTE_AMOUNT.validPattern.test(normalizedAmount)) {
    return null;
  }

  const amountCents = Math.round(
    Number(normalizedAmount) * PRICE_ROUTE_AMOUNT.centsMultiplier
  );

  return Number.isSafeInteger(amountCents) ? amountCents : null;
}

/**
 * Determines whether an invalid input response belongs to the amount minimum.
 *
 * @param body - Parsed request body.
 * @returns Whether the response should include an amount field error.
 */
function hasMinimumAmountValidationError(body: unknown): boolean {
  const amountCents = parseRouteAmountCents(
    readStringField(body, PRICE_ROUTE_FIELD.amount)
  );

  return (
    amountCents !== null &&
    amountCents < TRIBE_SUBSCRIPTION_PRICE_MINIMUM_AMOUNT_CENTS
  );
}

/**
 * Determines whether an invalid input response belongs to the free trial range.
 *
 * @param body - Parsed request body.
 * @returns Whether the response should include a trial frequency field error.
 */
function hasTrialFrequencyValidationError(body: unknown): boolean {
  const trialFrequency = readOptionalStringField(
    body,
    PRICE_ROUTE_FIELD.trialFrequency
  )?.trim();
  const trialFrequencyType = readOptionalStringField(
    body,
    PRICE_ROUTE_FIELD.trialFrequencyType
  )?.trim();
  const normalizedTrialFrequencyType =
    trialFrequencyType || PRICE_ROUTE_TRIAL.daysType;

  if (!trialFrequency) {
    return false;
  }

  if (normalizedTrialFrequencyType !== PRICE_ROUTE_TRIAL.daysType) {
    return false;
  }

  if (!PRICE_ROUTE_TRIAL.validPattern.test(trialFrequency)) {
    return true;
  }

  const parsedTrialFrequency = Number(trialFrequency);

  return (
    !Number.isSafeInteger(parsedTrialFrequency) ||
    parsedTrialFrequency < TRIBE_SUBSCRIPTION_TRIAL_MINIMUM_DAYS ||
    parsedTrialFrequency > TRIBE_SUBSCRIPTION_TRIAL_MAXIMUM_DAYS
  );
}

/**
 * Creates the safe response used for invalid price creation input.
 *
 * @param body - Parsed request body.
 * @returns JSON body with generic or field-specific validation feedback.
 */
function createInvalidPriceInputResponse(body: unknown): Record<string, unknown> {
  if (hasMinimumAmountValidationError(body)) {
    return createInvalidPriceAmountResponse();
  }

  if (hasTrialFrequencyValidationError(body)) {
    return createInvalidTrialFrequencyResponse();
  }

  return { message: PRICE_ROUTE_RESPONSE.invalidInputMessage };
}

/**
 * Detects the Mercado Pago minimum amount rejection without exposing provider text.
 *
 * @param error - Error thrown by the provider adapter.
 * @returns Whether the error should be mapped to the amount field.
 */
function isMercadoPagoMinimumAmountError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes(MERCADO_PAGO_PRICE_REJECTION.minimumAmountMessage)
  );
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
  const modules = await createRequestModules({ requestId });
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
  const modules = await createRequestModules({ requestId });
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
      paymentIntegrationId: readStringField(
        body,
        PRICE_ROUTE_FIELD.paymentIntegrationId
      ),
      productKey: readOptionalStringField(body, PRICE_ROUTE_FIELD.productKey),
      trialFrequency: readOptionalStringField(
        body,
        PRICE_ROUTE_FIELD.trialFrequency
      ),
      trialFrequencyType: readOptionalStringField(
        body,
        PRICE_ROUTE_FIELD.trialFrequencyType
      ),
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
          createInvalidPriceInputResponse(body),
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
    if (isMercadoPagoMinimumAmountError(error)) {
      return createJsonResponse(
        createInvalidPriceAmountResponse(),
        HTTP_STATUS.badRequest
      );
    }

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
