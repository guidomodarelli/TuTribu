import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import {
  createRouteJsonResponse,
  type RequestModules,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";
import { handlePriceMemberRoute } from "../price-member-route";

const DELETE_WITH_ACTIONS_ROUTE_LOG = {
  failureMessage:
    "Tribe subscription price deletion with invitation actions failed",
  feature: "subscriptions",
  operation: "delete-tribe-subscription-price-with-invitation-actions",
} as const;

const DELETE_WITH_ACTIONS_ROUTE_RESPONSE = {
  deletedMessage: "Plan eliminado y links de invitación actualizados.",
  forbiddenMessage: "No tenés permisos para gestionar precios.",
  hasSubscribersMessage: "No podés eliminar un plan con miembros asociados.",
  invalidInputMessage:
    "Las acciones sobre los links no son válidas. Refrescá y volvé a intentar.",
  missingIntegrationMessage:
    "Reconectá Mercado Pago para verificar el plan antes de eliminarlo.",
  notFoundMessage: "No pudimos encontrar el precio.",
  unauthorizedMessage: "Iniciá sesión para gestionar precios.",
  unexpectedMessage:
    "No pudimos eliminar el plan. Verificá los links y volvé a intentar.",
} as const;

const DELETE_WITH_ACTIONS_FIELD = {
  invitationActions: "invitationActions",
} as const;

function readInvitationActions(body: unknown): unknown {
  if (!body || typeof body !== "object") {
    return null;
  }

  return (body as Record<string, unknown>)[
    DELETE_WITH_ACTIONS_FIELD.invitationActions
  ];
}

type DeleteTribeSubscriptionPriceWithInvitationActionsResult = Awaited<
  ReturnType<RequestModules["subscriptions"]["useCases"]["deleteTribeSubscriptionPriceWithInvitationActions"]>
>;

function createPostResultResponse(result: DeleteTribeSubscriptionPriceWithInvitationActionsResult, priceId: string): Response {
  switch (result.status) {
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted:
      return createRouteJsonResponse(
        {
          deletedPriceId: priceId,
          message: DELETE_WITH_ACTIONS_ROUTE_RESPONSE.deletedMessage,
        },
        HTTP_STATUS.ok
      );
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput:
      return createRouteJsonResponse(
        { message: DELETE_WITH_ACTIONS_ROUTE_RESPONSE.invalidInputMessage },
        HTTP_STATUS.badRequest
      );
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers:
      return createRouteJsonResponse(
        { message: DELETE_WITH_ACTIONS_ROUTE_RESPONSE.hasSubscribersMessage },
        HTTP_STATUS.badRequest
      );
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration:
      return createRouteJsonResponse(
        {
          message:
            DELETE_WITH_ACTIONS_ROUTE_RESPONSE.missingIntegrationMessage,
        },
        HTTP_STATUS.serviceUnavailable
      );
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound:
      return createRouteJsonResponse(
        { message: DELETE_WITH_ACTIONS_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.created:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.current:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.hasLinkedInvitations:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.setupRequired:
    case TRIBE_SUBSCRIPTION_PRICE_STATUS.updated:
    default:
      return createRouteJsonResponse(
        { message: DELETE_WITH_ACTIONS_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
  }
}

export async function POST(
  request: Request,
  context: TribeRouteContext<{ priceId: string }>
) {
  return handlePriceMemberRoute(
    request,
    context,
    { log: DELETE_WITH_ACTIONS_ROUTE_LOG, response: DELETE_WITH_ACTIONS_ROUTE_RESPONSE, withRequestId: true },
    async ({ modules, priceId, slug }) => {
      const body: unknown = await request.json().catch(() => null);
      const result =
        await modules.subscriptions.useCases.deleteTribeSubscriptionPriceWithInvitationActions(
          {
            invitationActions: readInvitationActions(body),
            priceId,
            tribeSlug: slug,
          }
        );

      return createPostResultResponse(result, priceId);
    }
  );
}
