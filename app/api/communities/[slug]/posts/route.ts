import { POST_MUTATION_STATUS } from "@/src/modules/posts/constants/post-feed";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const CREATE_POST_ROUTE_FIELD = {
  content: "content",
  title: "title",
} as const;

const CREATE_POST_ROUTE_LOG = {
  createFailureMessage: "Community post creation failed",
  feature: "posts",
  operation: "create-community-post",
} as const;

const CREATE_POST_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenes permisos para publicar en esta comunidad.",
  invalidContentMessage: "Completá el título y el contenido antes de publicar.",
  notFoundMessage: "No pudimos encontrar la comunidad.",
  successMessage: "Publicacion creada.",
  unexpectedMessage: "No pudimos crear la publicacion. Intentalo de nuevo.",
  unauthorizedMessage: "Inicia sesion para publicar.",
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
  if (!body || typeof body !== "object" || !(CREATE_POST_ROUTE_FIELD.content in body)) {
    return "";
  }

  const content = (body as Record<string, unknown>)[CREATE_POST_ROUTE_FIELD.content];

  return typeof content === "string" ? content : "";
}

function readTitleFromBody(body: unknown): string {
  if (!body || typeof body !== "object" || !(CREATE_POST_ROUTE_FIELD.title in body)) {
    return "";
  }

  const title = (body as Record<string, unknown>)[CREATE_POST_ROUTE_FIELD.title];

  return typeof title === "string" ? title : "";
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
    feature: CREATE_POST_ROUTE_LOG.feature,
    operation: CREATE_POST_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: CREATE_POST_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const result = await modules.posts.useCases.createCommunityPost({
      authorId: authenticatedMember.id,
      communitySlug: slug,
      content: readContentFromBody(body),
      title: readTitleFromBody(body),
    });

    switch (result.status) {
      case POST_MUTATION_STATUS.created:
        return createJsonResponse(
          {
            message: CREATE_POST_ROUTE_RESPONSE.successMessage,
            post: result.post,
          },
          HTTP_STATUS.created
        );
      case POST_MUTATION_STATUS.invalidContent:
        return createJsonResponse(
          { message: CREATE_POST_ROUTE_RESPONSE.invalidContentMessage },
          HTTP_STATUS.badRequest
        );
      case POST_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: CREATE_POST_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case POST_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: CREATE_POST_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: CREATE_POST_ROUTE_LOG.createFailureMessage,
      error,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: CREATE_POST_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
