import { TRIBE_INVITATION_STATUS } from "@/src/modules/tribes/constants/tribe-invitations";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type RequestModules,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { readInvitationReferralMetadata } from "./invitation-request-body";
import { HTTP_STATUS } from "@/app/api/route-http-status";

const INVITATION_ROUTE_LOG = {
  createFailureMessage: "Tribe invitation creation failed",
  feature: "tribes",
  listFailureMessage: "Tribe invitation listing failed",
  operation: "manage-tribe-invitations",
} as const;

const INVITATION_ROUTE_RESPONSE = {
  createdMessage: "Link de invitación creado.",
  forbiddenMessage: "No tenés permisos para gestionar invitaciones.",
  invalidInputMessage:
    "Elegí a qué plan querés asociar este link de invitación.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  setupRequiredMessage:
    "Las invitaciones todavía no están configuradas. Aplicá la migración de base de datos y volvé a intentar.",
  unauthorizedMessage: "Iniciá sesión para gestionar invitaciones.",
  unexpectedCreateMessage: "No pudimos crear la invitación. Intentá de nuevo.",
  unexpectedListMessage: "No pudimos cargar las invitaciones. Intentá de nuevo.",
} as const;

const INVITATION_ROUTE_FIELD = {
  subscriptionAssociation: "subscriptionAssociation",
} as const;

function readSubscriptionAssociation(body: unknown): unknown {
  if (!body || typeof body !== "object") {
    return null;
  }

  return (body as Record<string, unknown>)[
    INVITATION_ROUTE_FIELD.subscriptionAssociation
  ];
}

const MEMBER_ROUTE_SCOPE = {
  feature: INVITATION_ROUTE_LOG.feature,
  operation: INVITATION_ROUTE_LOG.operation,
  unauthorizedMessage: INVITATION_ROUTE_RESPONSE.unauthorizedMessage,
} as const;

export async function GET(
  request: Request,
  context: TribeRouteContext
) {
  const { slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: INVITATION_ROUTE_LOG.listFailureMessage,
      metadata: { slug },
      responseMessage: INVITATION_ROUTE_RESPONSE.unexpectedListMessage,
    },
    async ({ modules }) => {
      return createRouteJsonResponse(
        {
          invitations: await modules.tribes.useCases.listTribeInvitations({
            baseUrl: resolvePublicAppBaseUrl(),
            tribeSlug: slug,
          }),
        },
        HTTP_STATUS.ok
      );
    }
  );
}

type CreateTribeInvitationResult = Awaited<
  ReturnType<RequestModules["tribes"]["useCases"]["createTribeInvitation"]>
>;

function createPostResultResponse(result: CreateTribeInvitationResult): Response {
  switch (result.status) {
    case TRIBE_INVITATION_STATUS.created:
      return createRouteJsonResponse(
        {
          invitation: result.invitation,
          invitationUrl: result.invitationUrl,
          message: INVITATION_ROUTE_RESPONSE.createdMessage,
        },
        HTTP_STATUS.created
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
    case TRIBE_INVITATION_STATUS.setupRequired:
      return createRouteJsonResponse(
        { message: INVITATION_ROUTE_RESPONSE.setupRequiredMessage },
        HTTP_STATUS.serviceUnavailable
      );
    case TRIBE_INVITATION_STATUS.forbidden:
    default:
      return createRouteJsonResponse(
        { message: INVITATION_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
  }
}

export async function POST(
  request: Request,
  context: TribeRouteContext
) {
  const { slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: INVITATION_ROUTE_LOG.createFailureMessage,
      metadata: { slug },
      responseMessage: INVITATION_ROUTE_RESPONSE.unexpectedCreateMessage,
    },
    async ({ modules }) => {
      const body: unknown = await request.json().catch(() => null);
      const referralMetadata = readInvitationReferralMetadata(body);
      const result = await modules.tribes.useCases.createTribeInvitation({
        baseUrl: resolvePublicAppBaseUrl(),
        campaignName: referralMetadata.campaignName,
        channel: referralMetadata.channel,
        referrerHandle: referralMetadata.referrerHandle,
        subscriptionAssociation: readSubscriptionAssociation(body),
        tribeSlug: slug,
      });

      return createPostResultResponse(result);
    }
  );
}
