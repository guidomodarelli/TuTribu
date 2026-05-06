import { TRIBE_INVITATION_STATUS } from "@/src/modules/tribes/constants/tribe-invitations";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const INVITATION_ROUTE_LOG = {
  feature: "tribes",
  operation: "revoke-tribe-invitation",
  revokeFailureMessage: "Tribe invitation revocation failed",
} as const;

const INVITATION_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés permisos para gestionar invitaciones.",
  notFoundMessage: "No pudimos encontrar la invitación.",
  revokedMessage: "Invitación revocada.",
  unauthorizedMessage: "Iniciá sesión para gestionar invitaciones.",
  unexpectedMessage: "No pudimos revocar la invitación. Intentá de nuevo.",
} as const;

const HTTP_STATUS = {
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

export async function DELETE(
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
    feature: INVITATION_ROUTE_LOG.feature,
    operation: INVITATION_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: INVITATION_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const result = await modules.tribes.useCases.revokeTribeInvitation({
      invitationId,
      tribeSlug: slug,
    });

    switch (result.status) {
      case TRIBE_INVITATION_STATUS.revoked:
        return createJsonResponse(
          { message: INVITATION_ROUTE_RESPONSE.revokedMessage },
          HTTP_STATUS.ok
        );
      case TRIBE_INVITATION_STATUS.notFound:
        return createJsonResponse(
          { message: INVITATION_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case TRIBE_INVITATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: INVITATION_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: INVITATION_ROUTE_LOG.revokeFailureMessage,
      error,
      metadata: {
        invitationId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: INVITATION_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
