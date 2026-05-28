import { TRIBE_INVITATION_STATUS } from "@/src/modules/tribes/constants/tribe-invitations";
import { createRequestModules } from "@/src/modules/setup";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const INVITATION_ROUTE_LOG = {
  feature: "tribes",
  metadataUpdateFailureMessage:
    "Tribe invitation referral metadata update failed",
  metadataUpdateOperation: "update-tribe-invitation-referral-metadata",
  operation: "revoke-tribe-invitation",
  revokeFailureMessage: "Tribe invitation revocation failed",
} as const;

const INVITATION_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés permisos para gestionar invitaciones.",
  invalidInputMessage:
    "Revisá el canal, la campaña y el referente antes de guardar.",
  metadataUpdatedMessage: "Canal de referido actualizado.",
  notFoundMessage: "No pudimos encontrar la invitación.",
  revokedMessage: "Invitación revocada.",
  unauthorizedMessage: "Iniciá sesión para gestionar invitaciones.",
  unexpectedMessage: "No pudimos revocar la invitación. Intentá de nuevo.",
  unexpectedMetadataMessage:
    "No pudimos actualizar el canal de referido. Intentá de nuevo.",
} as const;

const INVITATION_ROUTE_FIELD = {
  campaignName: "campaignName",
  channel: "channel",
  referrerHandle: "referrerHandle",
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

function readInvitationReferralMetadata(body: unknown): {
  campaignName: unknown;
  channel: unknown;
  referrerHandle: unknown;
} {
  if (!body || typeof body !== "object") {
    return {
      campaignName: undefined,
      channel: undefined,
      referrerHandle: undefined,
    };
  }

  const bodyRecord = body as Record<string, unknown>;

  return {
    campaignName: bodyRecord[INVITATION_ROUTE_FIELD.campaignName],
    channel: bodyRecord[INVITATION_ROUTE_FIELD.channel],
    referrerHandle: bodyRecord[INVITATION_ROUTE_FIELD.referrerHandle],
  };
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
    feature: INVITATION_ROUTE_LOG.feature,
    operation: INVITATION_ROUTE_LOG.metadataUpdateOperation,
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
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return createJsonResponse(
        { message: INVITATION_ROUTE_RESPONSE.invalidInputMessage },
        HTTP_STATUS.badRequest
      );
    }

    const referralMetadata = readInvitationReferralMetadata(body);
    const result =
      await modules.tribes.useCases.updateTribeInvitationReferralMetadata({
        baseUrl: resolvePublicAppBaseUrl(),
        campaignName: referralMetadata.campaignName,
        channel: referralMetadata.channel,
        invitationId,
        referrerHandle: referralMetadata.referrerHandle,
        tribeSlug: slug,
      });

    switch (result.status) {
      case TRIBE_INVITATION_STATUS.updated:
        return createJsonResponse(
          {
            invitation: result.invitation,
            message: INVITATION_ROUTE_RESPONSE.metadataUpdatedMessage,
          },
          HTTP_STATUS.ok
        );
      case TRIBE_INVITATION_STATUS.invalid:
        return createJsonResponse(
          { message: INVITATION_ROUTE_RESPONSE.invalidInputMessage },
          HTTP_STATUS.badRequest
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
      message: INVITATION_ROUTE_LOG.metadataUpdateFailureMessage,
      error,
      metadata: {
        invitationId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: INVITATION_ROUTE_RESPONSE.unexpectedMetadataMessage },
      HTTP_STATUS.serverError
    );
  }
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
