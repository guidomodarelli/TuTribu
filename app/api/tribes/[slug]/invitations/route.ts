import { TRIBE_INVITATION_STATUS } from "@/src/modules/tribes/constants/tribe-invitations";
import { createRequestModules } from "@/src/modules/setup";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const INVITATION_ROUTE_LOG = {
  createFailureMessage: "Tribe invitation creation failed",
  feature: "tribes",
  listFailureMessage: "Tribe invitation listing failed",
  operation: "manage-tribe-invitations",
} as const;

const INVITATION_ROUTE_RESPONSE = {
  createdMessage: "Link de invitación creado.",
  forbiddenMessage: "No tenés permisos para gestionar invitaciones.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  setupRequiredMessage:
    "Las invitaciones todavía no están configuradas. Aplicá la migración de base de datos y volvé a intentar.",
  unauthorizedMessage: "Iniciá sesión para gestionar invitaciones.",
  unexpectedCreateMessage: "No pudimos crear la invitación. Intentá de nuevo.",
  unexpectedListMessage: "No pudimos cargar las invitaciones. Intentá de nuevo.",
} as const;

const HTTP_STATUS = {
  created: 201,
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
    return createJsonResponse(
      {
        invitations: await modules.tribes.useCases.listTribeInvitations({
          tribeSlug: slug,
        }),
      },
      HTTP_STATUS.ok
    );
  } catch (error) {
    logger.error({
      message: INVITATION_ROUTE_LOG.listFailureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: INVITATION_ROUTE_RESPONSE.unexpectedListMessage },
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
    const result = await modules.tribes.useCases.createTribeInvitation({
      baseUrl: resolvePublicAppBaseUrl(),
      tribeSlug: slug,
    });

    switch (result.status) {
      case TRIBE_INVITATION_STATUS.created:
        return createJsonResponse(
          {
            invitation: result.invitation,
            invitationUrl: result.invitationUrl,
            message: INVITATION_ROUTE_RESPONSE.createdMessage,
          },
          HTTP_STATUS.created
        );
      case TRIBE_INVITATION_STATUS.notFound:
        return createJsonResponse(
          { message: INVITATION_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case TRIBE_INVITATION_STATUS.setupRequired:
        return createJsonResponse(
          { message: INVITATION_ROUTE_RESPONSE.setupRequiredMessage },
          HTTP_STATUS.serviceUnavailable
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
      message: INVITATION_ROUTE_LOG.createFailureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: INVITATION_ROUTE_RESPONSE.unexpectedCreateMessage },
      HTTP_STATUS.serverError
    );
  }
}
