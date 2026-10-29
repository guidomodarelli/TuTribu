import { TRIBE_INVITATION_STATUS } from "@/src/modules/tribes/constants/tribe-invitations";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";

const INVITATION_ASSOCIATION_ROUTE_LOG = {
  feature: "tribes",
  operation: "update-tribe-invitation-subscription-association",
  updateFailureMessage: "Tribe invitation subscription association update failed",
} as const;

const INVITATION_ASSOCIATION_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés permisos para gestionar invitaciones.",
  invalidInputMessage:
    "El plan elegido no es válido para esta invitación. Refrescá y volvé a intentar.",
  notFoundMessage: "No pudimos encontrar la invitación.",
  unauthorizedMessage: "Iniciá sesión para gestionar invitaciones.",
  unexpectedMessage:
    "No pudimos actualizar el plan de la invitación. Intentá de nuevo.",
  updatedMessage: "Plan asociado actualizado.",
} as const;

const INVITATION_ASSOCIATION_ROUTE_FIELD = {
  subscriptionAssociation: "subscriptionAssociation",
} as const;

function readSubscriptionAssociation(body: unknown): unknown {
  if (!body || typeof body !== "object") {
    return null;
  }

  return (body as Record<string, unknown>)[
    INVITATION_ASSOCIATION_ROUTE_FIELD.subscriptionAssociation
  ];
}

const MEMBER_ROUTE_SCOPE = {
  feature: INVITATION_ASSOCIATION_ROUTE_LOG.feature,
  operation: INVITATION_ASSOCIATION_ROUTE_LOG.operation,
  unauthorizedMessage: INVITATION_ASSOCIATION_ROUTE_RESPONSE.unauthorizedMessage,
} as const;

export async function PATCH(
  request: Request,
  context: TribeRouteContext<{ invitationId: string }>
) {
  const { invitationId, slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: INVITATION_ASSOCIATION_ROUTE_LOG.updateFailureMessage,
      metadata: { invitationId, slug },
      responseMessage: INVITATION_ASSOCIATION_ROUTE_RESPONSE.unexpectedMessage,
    },
    async ({ modules }) => {
      const body: unknown = await request.json().catch(() => null);
      const result =
        await modules.tribes.useCases.updateTribeInvitationSubscriptionAssociation({
          baseUrl: resolvePublicAppBaseUrl(),
          invitationId,
          subscriptionAssociation: readSubscriptionAssociation(body),
          tribeSlug: slug,
        });

      switch (result.status) {
        case TRIBE_INVITATION_STATUS.updated:
          return createRouteJsonResponse(
            {
              invitation: result.invitation,
              message: INVITATION_ASSOCIATION_ROUTE_RESPONSE.updatedMessage,
            },
            HTTP_STATUS.ok
          );
        case TRIBE_INVITATION_STATUS.invalid:
          return createRouteJsonResponse(
            { message: INVITATION_ASSOCIATION_ROUTE_RESPONSE.invalidInputMessage },
            HTTP_STATUS.badRequest
          );
        case TRIBE_INVITATION_STATUS.notFound:
          return createRouteJsonResponse(
            { message: INVITATION_ASSOCIATION_ROUTE_RESPONSE.notFoundMessage },
            HTTP_STATUS.notFound
          );
        case TRIBE_INVITATION_STATUS.forbidden:
        default:
          return createRouteJsonResponse(
            { message: INVITATION_ASSOCIATION_ROUTE_RESPONSE.forbiddenMessage },
            HTTP_STATUS.forbidden
          );
      }
    }
  );
}
