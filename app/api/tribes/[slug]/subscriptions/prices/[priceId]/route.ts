/**
 * Handles tribe subscription price item deletion.
 *
 * @module tribe-subscription-price-route
 */

import {
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
  TRIBE_SUBSCRIPTION_TRIAL_MAXIMUM_DAYS,
  TRIBE_SUBSCRIPTION_TRIAL_MINIMUM_DAYS,
} from "@/src/modules/subscriptions/constants/subscriptions";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type RequestModules,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { readOptionalStringField, readStringField } from "@/app/api/request-body-fields";
import { HTTP_STATUS } from "@/app/api/route-http-status";

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
  hasLinkedInvitationsMessage:
    "Este plan tiene links de invitación asociados. Decidí qué hacer con cada uno antes de eliminarlo.",
  hasSubscribersMessage: "No podés eliminar un precio con miembros asociados.",
  invalidInputMessage: "Definí un nombre y un precio mensual válido.",
  invalidTrialFieldMessage:
    "La prueba gratis debe ser de entre 1 y 14 días.",
  invalidTrialInputMessage:
    "Definí un nombre, un precio mensual y una prueba gratis válidos.",
  limitReachedMessage: "La tribu ya tiene 30 precios. Eliminá uno sin miembros para crear otro.",
  missingIntegrationMessage: "Conectá Mercado Pago antes de gestionar precios.",
  notFoundMessage: "No pudimos encontrar el precio.",
  unauthorizedMessage: "Iniciá sesión para gestionar precios.",
  unexpectedMessage: "No pudimos eliminar el precio. Intentá de nuevo.",
  unexpectedUpdateMessage: "No pudimos actualizar el precio. Intentá de nuevo.",
  updatedMessage: "Precio actualizado.",
} as const;

const PRICE_ITEM_ROUTE_FIELD = {
  amount: "amount",
  name: "name",
  trialFrequency: "trialFrequency",
  trialFrequencyType: "trialFrequencyType",
} as const;

const PRICE_ITEM_ROUTE_TRIAL = {
  daysType: "days",
  validPattern: /^\d+$/,
} as const;

/**
 * Creates the safe response used for trial validation failures.
 *
 * @returns JSON body with form field errors.
 */
function createInvalidTrialFrequencyResponse(): Record<string, unknown> {
  return {
    fieldErrors: {
      [PRICE_ITEM_ROUTE_FIELD.trialFrequency]:
        PRICE_ITEM_ROUTE_RESPONSE.invalidTrialFieldMessage,
    },
    message: PRICE_ITEM_ROUTE_RESPONSE.invalidTrialInputMessage,
  };
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
    PRICE_ITEM_ROUTE_FIELD.trialFrequency
  )?.trim();
  const trialFrequencyType = readOptionalStringField(
    body,
    PRICE_ITEM_ROUTE_FIELD.trialFrequencyType
  )?.trim();
  // A blank type falls back to days, like a missing one.
  const normalizedTrialFrequencyType =
    trialFrequencyType === undefined || trialFrequencyType === ""
      ? PRICE_ITEM_ROUTE_TRIAL.daysType
      : trialFrequencyType;

  if (!trialFrequency) {
    return false;
  }

  if (normalizedTrialFrequencyType !== PRICE_ITEM_ROUTE_TRIAL.daysType) {
    return false;
  }

  if (!PRICE_ITEM_ROUTE_TRIAL.validPattern.test(trialFrequency)) {
    return true;
  }

  const parsedTrialFrequency = Number(trialFrequency);

  return (
    !Number.isSafeInteger(parsedTrialFrequency) ||
    parsedTrialFrequency < TRIBE_SUBSCRIPTION_TRIAL_MINIMUM_DAYS ||
    parsedTrialFrequency > TRIBE_SUBSCRIPTION_TRIAL_MAXIMUM_DAYS
  );
}

type UpdateTribeSubscriptionPriceResult = Awaited<
  ReturnType<RequestModules["subscriptions"]["useCases"]["updateTribeSubscriptionPrice"]>
>;

function createPatchResultResponse(result: UpdateTribeSubscriptionPriceResult, body: unknown): Response {
  switch (result.status) {
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.created:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.current:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.updated:
      return createRouteJsonResponse(
        {
          message: PRICE_ITEM_ROUTE_RESPONSE.updatedMessage,
          price: result.price,
        },
        HTTP_STATUS.ok
      );
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput:
      return createRouteJsonResponse(
        hasTrialFrequencyValidationError(body)
          ? createInvalidTrialFrequencyResponse()
          : { message: PRICE_ITEM_ROUTE_RESPONSE.invalidInputMessage },
        HTTP_STATUS.badRequest
      );
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached:
      return createRouteJsonResponse(
        { message: PRICE_ITEM_ROUTE_RESPONSE.limitReachedMessage },
        HTTP_STATUS.badRequest
      );
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration:
      return createRouteJsonResponse(
        { message: PRICE_ITEM_ROUTE_RESPONSE.missingIntegrationMessage },
        HTTP_STATUS.serviceUnavailable
      );
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound:
      return createRouteJsonResponse(
        { message: PRICE_ITEM_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.hasLinkedInvitations:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired:
    default:
      return createRouteJsonResponse(
        { message: PRICE_ITEM_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
  }
}

export async function PATCH(
  request: Request,
  context: TribeRouteContext<{ priceId: string }>
) {
  const { priceId, slug } = await context.params;

  return handleMemberRoute(
    request,
    {
      feature: PRICE_ITEM_ROUTE_LOG.feature,
      operation: PRICE_ITEM_ROUTE_LOG.updateOperation,
      unauthorizedMessage: PRICE_ITEM_ROUTE_RESPONSE.unauthorizedMessage,
      withRequestId: true,
    },
    {
      logMessage: PRICE_ITEM_ROUTE_LOG.updateFailureMessage,
      metadata: { priceId, slug },
      responseMessage: PRICE_ITEM_ROUTE_RESPONSE.unexpectedUpdateMessage,
    },
    async ({ modules }) => {
      const body: unknown = await request.json().catch(() => null);
      const result =
        await modules.subscriptions.useCases.updateTribeSubscriptionPrice({
          amount: readStringField(body, PRICE_ITEM_ROUTE_FIELD.amount),
          name: readStringField(body, PRICE_ITEM_ROUTE_FIELD.name),
          priceId,
          trialFrequency: readOptionalStringField(
            body,
            PRICE_ITEM_ROUTE_FIELD.trialFrequency
          ),
          trialFrequencyType: readOptionalStringField(
            body,
            PRICE_ITEM_ROUTE_FIELD.trialFrequencyType
          ),
          tribeSlug: slug,
        });

      return createPatchResultResponse(result, body);
    }
  );
}

type DeleteTribeSubscriptionPriceResult = Awaited<
  ReturnType<RequestModules["subscriptions"]["useCases"]["deleteTribeSubscriptionPrice"]>
>;

async function createDeleteResultResponse(
  result: DeleteTribeSubscriptionPriceResult,
  { modules, priceId, slug }: { modules: RequestModules; priceId: string; slug: string }
): Promise<Response> {
  switch (result.status) {
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled:
      return createRouteJsonResponse(
        {
          message: PRICE_ITEM_ROUTE_RESPONSE.canceledMessage,
          price: result.price,
        },
        HTTP_STATUS.ok
      );
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted:
      return createRouteJsonResponse(
        {
          deletedPriceId: priceId,
          message: PRICE_ITEM_ROUTE_RESPONSE.deletedMessage,
        },
        HTTP_STATUS.ok
      );
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers:
      return createRouteJsonResponse(
        { message: PRICE_ITEM_ROUTE_RESPONSE.hasSubscribersMessage },
        HTTP_STATUS.badRequest
      );
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.hasLinkedInvitations: {
      const linkedInvitations =
        await modules.tribes.useCases.listTribeInvitationsByPrice({
          baseUrl: resolvePublicAppBaseUrl(),
          priceId,
          tribeSlug: slug,
        });

      return createRouteJsonResponse(
        {
          linkedInvitations: linkedInvitations.invitations,
          message: PRICE_ITEM_ROUTE_RESPONSE.hasLinkedInvitationsMessage,
          status: result.status,
        },
        HTTP_STATUS.conflict
      );
    }
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration:
      return createRouteJsonResponse(
        { message: PRICE_ITEM_ROUTE_RESPONSE.missingIntegrationMessage },
        HTTP_STATUS.serviceUnavailable
      );
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound:
      return createRouteJsonResponse(
        { message: PRICE_ITEM_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.created:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.current:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.updated:
    default:
      return createRouteJsonResponse(
        { message: PRICE_ITEM_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
  }
}

export async function DELETE(
  request: Request,
  context: TribeRouteContext<{ priceId: string }>
) {
  const { priceId, slug } = await context.params;

  return handleMemberRoute(
    request,
    {
      feature: PRICE_ITEM_ROUTE_LOG.feature,
      operation: PRICE_ITEM_ROUTE_LOG.deleteOperation,
      unauthorizedMessage: PRICE_ITEM_ROUTE_RESPONSE.unauthorizedMessage,
      withRequestId: true,
    },
    {
      logMessage: PRICE_ITEM_ROUTE_LOG.deleteFailureMessage,
      metadata: { priceId, slug },
      responseMessage: PRICE_ITEM_ROUTE_RESPONSE.unexpectedMessage,
    },
    async ({ modules }) => {
      const result =
        await modules.subscriptions.useCases.deleteTribeSubscriptionPrice({
          priceId,
          tribeSlug: slug,
        });

      return await createDeleteResultResponse(result, { modules, priceId, slug });
    }
  );
}
