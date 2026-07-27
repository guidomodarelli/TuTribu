/**
 * Toggles the tokenless free open join for a free tribe. It lives next to the
 * free-join current toggle because both answer the same product question: how
 * members get in.
 *
 * @module tribe-open-free-join-route
 */

import { TRIBE_SUBSCRIPTION_PRICE_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { revalidateTribeStoryAboutCache } from "@/src/modules/tribes/infrastructure/cache/tribe-story-about-cache-revalidation";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const OPEN_FREE_JOIN_ROUTE_LOG = {
  failureMessage: "Tribe open free join toggle failed",
  feature: "subscriptions",
  operation: "set-tribe-open-free-join",
} as const;

const OPEN_FREE_JOIN_ROUTE_RESPONSE = {
  disabledMessage: "La entrada abierta quedó desactivada.",
  enabledMessage: "La entrada abierta quedó activada.",
  forbiddenMessage: "Solo el líder puede cambiar cómo se une la gente.",
  invalidBodyMessage: "Revisá la opción antes de guardar.",
  unauthorizedMessage: "Iniciá sesión para gestionar precios.",
  unexpectedMessage: "No pudimos guardar el cambio. Intentá de nuevo.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  forbidden: 403,
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

function isPayloadObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function PUT(
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
    feature: OPEN_FREE_JOIN_ROUTE_LOG.feature,
    operation: OPEN_FREE_JOIN_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember =
    await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: OPEN_FREE_JOIN_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const parsedBody = await request.json().catch(() => ({}));

    if (
      !isPayloadObject(parsedBody) ||
      typeof parsedBody.enabled !== "boolean"
    ) {
      return createJsonResponse(
        { message: OPEN_FREE_JOIN_ROUTE_RESPONSE.invalidBodyMessage },
        HTTP_STATUS.badRequest
      );
    }

    const enabled = parsedBody.enabled;
    const result = await modules.subscriptions.useCases.setTribeOpenFreeJoin({
      enabled,
      tribeSlug: slug,
    });

    if (result.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.current) {
      revalidateTribeStoryAboutCache(slug);

      return createJsonResponse(
        {
          message: enabled
            ? OPEN_FREE_JOIN_ROUTE_RESPONSE.enabledMessage
            : OPEN_FREE_JOIN_ROUTE_RESPONSE.disabledMessage,
          openFreeJoinEnabled: enabled,
        },
        HTTP_STATUS.ok
      );
    }

    return createJsonResponse(
      { message: OPEN_FREE_JOIN_ROUTE_RESPONSE.forbiddenMessage },
      HTTP_STATUS.forbidden
    );
  } catch (error) {
    logger.error({
      error,
      message: OPEN_FREE_JOIN_ROUTE_LOG.failureMessage,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: OPEN_FREE_JOIN_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
