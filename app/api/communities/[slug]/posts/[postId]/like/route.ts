import { POST_MUTATION_STATUS } from "@/src/modules/posts/constants/post-feed";
import { isUuidRouteParam } from "@/src/modules/posts/infrastructure/http/post-route-params";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const TOGGLE_POST_LIKE_ROUTE_LOG = {
  feature: "posts",
  operation: "toggle-post-like",
  toggleFailureMessage: "Post like toggle failed",
} as const;

const TOGGLE_POST_LIKE_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para reaccionar a esta publicacion.",
  notFoundMessage: "No pudimos encontrar la publicacion.",
  successMessage: "Reaccion actualizada.",
  unexpectedMessage: "No pudimos actualizar la reaccion. Intentalo de nuevo.",
  unauthorizedMessage: "Inicia sesion para reaccionar.",
} as const;

const HTTP_STATUS = {
  ok: 200,
  forbidden: 403,
  notFound: 404,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(
  body: Record<string, boolean | string>,
  status: number
): Response {
  return Response.json(body, { status });
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      postId: string;
      slug: string;
    }>;
  }
) {
  const { postId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: TOGGLE_POST_LIKE_ROUTE_LOG.feature,
    operation: TOGGLE_POST_LIKE_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: TOGGLE_POST_LIKE_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  if (!isUuidRouteParam(postId)) {
    return createJsonResponse(
      { message: TOGGLE_POST_LIKE_ROUTE_RESPONSE.notFoundMessage },
      HTTP_STATUS.notFound
    );
  }

  try {
    const result = await modules.posts.useCases.togglePostLike({
      communitySlug: slug,
      postId,
      userId: authenticatedMember.id,
    });

    switch (result.status) {
      case POST_MUTATION_STATUS.liked:
      case POST_MUTATION_STATUS.unliked:
        return createJsonResponse(
          {
            likedByViewer: result.likedByViewer,
            message: TOGGLE_POST_LIKE_ROUTE_RESPONSE.successMessage,
          },
          HTTP_STATUS.ok
        );
      case POST_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: TOGGLE_POST_LIKE_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case POST_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: TOGGLE_POST_LIKE_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: TOGGLE_POST_LIKE_ROUTE_LOG.toggleFailureMessage,
      error,
      metadata: {
        postId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: TOGGLE_POST_LIKE_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
