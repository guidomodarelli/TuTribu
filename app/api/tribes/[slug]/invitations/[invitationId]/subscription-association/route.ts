import { TRIBE_INVITATION_STATUS } from "@/src/modules/tribes/constants/tribe-invitations";
import { createRequestModules } from "@/src/modules/setup";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

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

const HTTP_STATUS = {
  badRequest: 400,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

function readSubscriptionAssociation(body: unknown): unknown {
  if (!body || typeof body !== "object") {
    return null;
  }

  return (body as Record<string, unknown>)[
    INVITATION_ASSOCIATION_ROUTE_FIELD.subscriptionAssociation
  ];
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      invitationId: string;
      slug: string;
    }>;
  }
) {
  const { invitationId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: INVITATION_ASSOCIATION_ROUTE_LOG.feature,
    operation: INVITATION_ASSOCIATION_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: INVITATION_ASSOCIATION_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const result =
      await modules.tribes.useCases.updateTribeInvitationSubscriptionAssociation({
        baseUrl: resolvePublicAppBaseUrl(),
        invitationId,
        subscriptionAssociation: readSubscriptionAssociation(body),
        tribeSlug: slug,
      });

    switch (result.status) {
      case TRIBE_INVITATION_STATUS.updated:
        return createJsonResponse(
          {
            invitation: result.invitation,
            message: INVITATION_ASSOCIATION_ROUTE_RESPONSE.updatedMessage,
          },
          HTTP_STATUS.ok
        );
      case TRIBE_INVITATION_STATUS.invalid:
        return createJsonResponse(
          { message: INVITATION_ASSOCIATION_ROUTE_RESPONSE.invalidInputMessage },
          HTTP_STATUS.badRequest
        );
      case TRIBE_INVITATION_STATUS.notFound:
        return createJsonResponse(
          { message: INVITATION_ASSOCIATION_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case TRIBE_INVITATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: INVITATION_ASSOCIATION_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: INVITATION_ASSOCIATION_ROUTE_LOG.updateFailureMessage,
      error,
      metadata: {
        invitationId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: INVITATION_ASSOCIATION_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
