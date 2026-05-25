import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

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

const HTTP_STATUS = {
  badRequest: 400,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  serviceUnavailable: 503,
  unauthorized: 401,
} as const;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

function readInvitationActions(body: unknown): unknown {
  if (!body || typeof body !== "object") {
    return null;
  }

  return (body as Record<string, unknown>)[
    DELETE_WITH_ACTIONS_FIELD.invitationActions
  ];
}

export async function POST(
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
    feature: DELETE_WITH_ACTIONS_ROUTE_LOG.feature,
    operation: DELETE_WITH_ACTIONS_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules({ requestId });
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: DELETE_WITH_ACTIONS_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const result =
      await modules.subscriptions.useCases.deleteTribeSubscriptionPriceWithInvitationActions(
        {
          invitationActions: readInvitationActions(body),
          priceId,
          tribeSlug: slug,
        }
      );

    switch (result.status) {
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted:
        return createJsonResponse(
          {
            deletedPriceId: priceId,
            message: DELETE_WITH_ACTIONS_ROUTE_RESPONSE.deletedMessage,
          },
          HTTP_STATUS.ok
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput:
        return createJsonResponse(
          { message: DELETE_WITH_ACTIONS_ROUTE_RESPONSE.invalidInputMessage },
          HTTP_STATUS.badRequest
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers:
        return createJsonResponse(
          { message: DELETE_WITH_ACTIONS_ROUTE_RESPONSE.hasSubscribersMessage },
          HTTP_STATUS.badRequest
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration:
        return createJsonResponse(
          {
            message:
              DELETE_WITH_ACTIONS_ROUTE_RESPONSE.missingIntegrationMessage,
          },
          HTTP_STATUS.serviceUnavailable
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound:
        return createJsonResponse(
          { message: DELETE_WITH_ACTIONS_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: DELETE_WITH_ACTIONS_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: DELETE_WITH_ACTIONS_ROUTE_LOG.failureMessage,
      error,
      metadata: {
        priceId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: DELETE_WITH_ACTIONS_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
