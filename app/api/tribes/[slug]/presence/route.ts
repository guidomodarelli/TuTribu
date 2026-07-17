import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const PRESENCE_ROUTE_LOG = {
  feature: "tribes",
  operation: "touch-tribe-presence",
  touchFailureMessage: "Tribe presence touch failed",
} as const;

const PRESENCE_ROUTE_RESPONSE = {
  unauthorizedMessage: "Iniciá sesión para registrar tu presencia.",
  unexpectedMessage: "No pudimos registrar tu presencia.",
} as const;

const HTTP_STATUS = {
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return Response.json(body, { status });
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
    feature: PRESENCE_ROUTE_LOG.feature,
    operation: PRESENCE_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember =
    await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: PRESENCE_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const touched = await modules.tribes.useCases.touchTribePresence({
      tribeSlug: slug,
    });

    return createJsonResponse({ touched }, HTTP_STATUS.ok);
  } catch (error) {
    logger.error({
      error,
      message: PRESENCE_ROUTE_LOG.touchFailureMessage,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: PRESENCE_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
