import { TRIBE_INVITATION_STATUS } from "@/src/modules/tribes/constants/tribe-invitations";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type RequestModules,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { readInvitationReferralMetadata } from "../invitation-request-body";
import { HTTP_STATUS } from "@/app/api/route-http-status";

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

type UpdateTribeInvitationReferralMetadataResult = Awaited<
  ReturnType<RequestModules["tribes"]["useCases"]["updateTribeInvitationReferralMetadata"]>
>;

function createPatchResultResponse(result: UpdateTribeInvitationReferralMetadataResult): Response {
  switch (result.status) {
    case TRIBE_INVITATION_STATUS.updated:
      return createRouteJsonResponse(
        {
          invitation: result.invitation,
          message: INVITATION_ROUTE_RESPONSE.metadataUpdatedMessage,
        },
        HTTP_STATUS.ok
      );
    case TRIBE_INVITATION_STATUS.invalid:
      return createRouteJsonResponse(
        { message: INVITATION_ROUTE_RESPONSE.invalidInputMessage },
        HTTP_STATUS.badRequest
      );
    case TRIBE_INVITATION_STATUS.notFound:
      return createRouteJsonResponse(
        { message: INVITATION_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    case TRIBE_INVITATION_STATUS.forbidden:
    default:
      return createRouteJsonResponse(
        { message: INVITATION_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
  }
}

export async function PATCH(
  request: Request,
  context: TribeRouteContext<{ invitationId: string }>
) {
  const { invitationId, slug } = await context.params;

  return handleMemberRoute(
    request,
    {
      feature: INVITATION_ROUTE_LOG.feature,
      operation: INVITATION_ROUTE_LOG.metadataUpdateOperation,
      unauthorizedMessage: INVITATION_ROUTE_RESPONSE.unauthorizedMessage,
    },
    {
      logMessage: INVITATION_ROUTE_LOG.metadataUpdateFailureMessage,
      metadata: { invitationId, slug },
      responseMessage: INVITATION_ROUTE_RESPONSE.unexpectedMetadataMessage,
    },
    async ({ modules }) => {
      let body: unknown;

      try {
        body = await request.json();
      } catch {
        return createRouteJsonResponse(
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

      return createPatchResultResponse(result);
    }
  );
}

export async function DELETE(
  request: Request,
  context: TribeRouteContext<{ invitationId: string }>
) {
  const { invitationId, slug } = await context.params;

  return handleMemberRoute(
    request,
    {
      feature: INVITATION_ROUTE_LOG.feature,
      operation: INVITATION_ROUTE_LOG.operation,
      unauthorizedMessage: INVITATION_ROUTE_RESPONSE.unauthorizedMessage,
    },
    {
      logMessage: INVITATION_ROUTE_LOG.revokeFailureMessage,
      metadata: { invitationId, slug },
      responseMessage: INVITATION_ROUTE_RESPONSE.unexpectedMessage,
    },
    async ({ modules }) => {
      const result = await modules.tribes.useCases.revokeTribeInvitation({
        invitationId,
        tribeSlug: slug,
      });

      switch (result.status) {
        case TRIBE_INVITATION_STATUS.revoked:
          return createRouteJsonResponse(
            { message: INVITATION_ROUTE_RESPONSE.revokedMessage },
            HTTP_STATUS.ok
          );
        case TRIBE_INVITATION_STATUS.notFound:
          return createRouteJsonResponse(
            { message: INVITATION_ROUTE_RESPONSE.notFoundMessage },
            HTTP_STATUS.notFound
          );
        case TRIBE_INVITATION_STATUS.forbidden:
        default:
          return createRouteJsonResponse(
            { message: INVITATION_ROUTE_RESPONSE.forbiddenMessage },
            HTTP_STATUS.forbidden
          );
      }
    }
  );
}
