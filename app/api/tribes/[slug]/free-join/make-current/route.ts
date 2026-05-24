/**
 * Marks the synthetic free-join option as the tribe's current offering.
 *
 * @module tribe-free-join-current-route
 */

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const FREE_JOIN_ROUTE_LOG = {
  failureMessage: "Tribe free-join current toggle failed",
  feature: "subscriptions",
  operation: "set-tribe-free-join-as-current",
} as const;

const FREE_JOIN_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés permisos para gestionar precios.",
  notFoundMessage: "No pudimos encontrar la tribu.",
  successMessage: "Entrada gratis marcada como actual.",
  unauthorizedMessage: "Iniciá sesión para gestionar precios.",
  unexpectedMessage:
    "No pudimos marcar la entrada gratis como actual. Intentá de nuevo.",
} as const;

const HTTP_STATUS = {
  forbidden: 403,
  notFound: 404,
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
    feature: FREE_JOIN_ROUTE_LOG.feature,
    operation: FREE_JOIN_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: FREE_JOIN_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const result = await modules.subscriptions.useCases.setTribeFreeJoinAsCurrent({
      tribeSlug: slug,
    });

    switch (result.status) {
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.current:
        return createJsonResponse(
          { message: FREE_JOIN_ROUTE_RESPONSE.successMessage },
          HTTP_STATUS.ok
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound:
        return createJsonResponse(
          { message: FREE_JOIN_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: FREE_JOIN_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: FREE_JOIN_ROUTE_LOG.failureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: FREE_JOIN_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
