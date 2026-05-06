import { POST_MUTATION_STATUS } from "@/src/modules/posts/constants/post-feed";
import { isUuidRouteParam } from "@/src/modules/posts/infrastructure/http/post-route-params";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const CREATE_COMMENT_ROUTE_FIELD = {
  content: "content",
} as const;

const CREATE_COMMENT_ROUTE_LOG = {
  createFailureMessage: "Post comment creation failed",
  feature: "posts",
  operation: "create-post-comment",
} as const;

const CREATE_COMMENT_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para comentar esta publicacion.",
  invalidContentMessage: "Escribi un comentario antes de enviarlo.",
  notFoundMessage: "No pudimos encontrar la publicacion.",
  successMessage: "Comentario creado.",
  unexpectedMessage: "No pudimos crear el comentario. Intentalo de nuevo.",
  unauthorizedMessage: "Inicia sesion para comentar.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  created: 201,
  forbidden: 403,
  notFound: 404,
  serverError: 500,
  unauthorized: 401,
} as const;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

function readContentFromBody(body: unknown): string {
  if (!body || typeof body !== "object" || !(CREATE_COMMENT_ROUTE_FIELD.content in body)) {
    return "";
  }

  const content = (body as Record<string, unknown>)[CREATE_COMMENT_ROUTE_FIELD.content];

  return typeof content === "string" ? content : "";
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
    feature: CREATE_COMMENT_ROUTE_LOG.feature,
    operation: CREATE_COMMENT_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: CREATE_COMMENT_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  if (!isUuidRouteParam(postId)) {
    return createJsonResponse(
      { message: CREATE_COMMENT_ROUTE_RESPONSE.notFoundMessage },
      HTTP_STATUS.notFound
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const result = await modules.posts.useCases.createPostComment({
      authorId: authenticatedMember.id,
      tribeSlug: slug,
      content: readContentFromBody(body),
      postId,
    });

    switch (result.status) {
      case POST_MUTATION_STATUS.created:
        return createJsonResponse(
          {
            comment: result.comment,
            message: CREATE_COMMENT_ROUTE_RESPONSE.successMessage,
          },
          HTTP_STATUS.created
        );
      case POST_MUTATION_STATUS.invalidContent:
        return createJsonResponse(
          { message: CREATE_COMMENT_ROUTE_RESPONSE.invalidContentMessage },
          HTTP_STATUS.badRequest
        );
      case POST_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: CREATE_COMMENT_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case POST_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: CREATE_COMMENT_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: CREATE_COMMENT_ROUTE_LOG.createFailureMessage,
      error,
      metadata: {
        postId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: CREATE_COMMENT_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
