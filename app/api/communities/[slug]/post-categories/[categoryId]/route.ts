import { POST_CATEGORY_MUTATION_STATUS } from "@/src/modules/posts/constants/post-feed";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const CATEGORY_ROUTE_FIELD = {
  emoji: "emoji",
  name: "name",
  sortOrder: "sortOrder",
  targetCategoryId: "targetCategoryId",
} as const;

const CATEGORY_ROUTE_LOG = {
  deleteFailureMessage: "Community post category deletion failed",
  feature: "posts",
  operation: "manage-community-post-category",
  updateFailureMessage: "Community post category update failed",
} as const;

const CATEGORY_ROUTE_RESPONSE = {
  categoryHasPostsMessage: "Elegí otra categoría para mover las publicaciones.",
  deleteSuccessMessage: "Categoría eliminada.",
  duplicateSlugMessage: "Ya existe una categoría con ese nombre.",
  forbiddenMessage: "No tenés permisos para gestionar categorías.",
  invalidCategoryMessage: "La categoría destino no pertenece a esta tribu.",
  invalidNameMessage: "Definí un nombre y un ícono para la categoría.",
  invalidSortOrderMessage: "El orden de la categoría es inválido.",
  lastCategoryMessage: "La tribu necesita al menos una categoría.",
  movedAndDeletedMessage: "Categoría eliminada y publicaciones movidas.",
  notFoundMessage: "No pudimos encontrar la categoría.",
  unauthorizedMessage: "Iniciá sesión para gestionar categorías.",
  unexpectedDeleteMessage: "No pudimos eliminar la categoría. Intentá de nuevo.",
  unexpectedUpdateMessage: "No pudimos actualizar la categoría. Intentá de nuevo.",
  updateSuccessMessage: "Categoría actualizada.",
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

function readStringField(body: unknown, field: string): string {
  if (!body || typeof body !== "object" || !(field in body)) {
    return "";
  }

  const value = (body as Record<string, unknown>)[field];

  return typeof value === "string" ? value : "";
}

function readNumberField(body: unknown, field: string): number | null {
  if (!body || typeof body !== "object" || !(field in body)) {
    return null;
  }

  const value = (body as Record<string, unknown>)[field];
  if (typeof value === "number") {
    return Number.isFinite(value) && Number.isInteger(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) && Number.isInteger(parsedValue)
    ? parsedValue
    : null;
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      categoryId: string;
      slug: string;
    }>;
  }
) {
  const { categoryId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: CATEGORY_ROUTE_LOG.feature,
    operation: CATEGORY_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: CATEGORY_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const sortOrder = readNumberField(body, CATEGORY_ROUTE_FIELD.sortOrder);

    if (sortOrder === null) {
      return createJsonResponse(
        { message: CATEGORY_ROUTE_RESPONSE.invalidSortOrderMessage },
        HTTP_STATUS.badRequest
      );
    }

    const result = await modules.posts.useCases.updateCommunityPostCategory({
      categoryId,
      communitySlug: slug,
      emoji: readStringField(body, CATEGORY_ROUTE_FIELD.emoji),
      name: readStringField(body, CATEGORY_ROUTE_FIELD.name),
      sortOrder,
    });

    switch (result.status) {
      case POST_CATEGORY_MUTATION_STATUS.updated:
        return createJsonResponse(
          {
            category: result.category,
            message: CATEGORY_ROUTE_RESPONSE.updateSuccessMessage,
          },
          HTTP_STATUS.ok
        );
      case POST_CATEGORY_MUTATION_STATUS.invalidName:
        return createJsonResponse(
          { message: CATEGORY_ROUTE_RESPONSE.invalidNameMessage },
          HTTP_STATUS.badRequest
        );
      case POST_CATEGORY_MUTATION_STATUS.duplicateSlug:
        return createJsonResponse(
          { message: CATEGORY_ROUTE_RESPONSE.duplicateSlugMessage },
          HTTP_STATUS.badRequest
        );
      case POST_CATEGORY_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: CATEGORY_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case POST_CATEGORY_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: CATEGORY_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: CATEGORY_ROUTE_LOG.updateFailureMessage,
      error,
      metadata: {
        categoryId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: CATEGORY_ROUTE_RESPONSE.unexpectedUpdateMessage },
      HTTP_STATUS.serverError
    );
  }
}

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{
      categoryId: string;
      slug: string;
    }>;
  }
) {
  const { categoryId, slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: CATEGORY_ROUTE_LOG.feature,
    operation: CATEGORY_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: CATEGORY_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const result = await modules.posts.useCases.deleteCommunityPostCategory({
      categoryId,
      communitySlug: slug,
      targetCategoryId: readStringField(body, CATEGORY_ROUTE_FIELD.targetCategoryId),
    });

    switch (result.status) {
      case POST_CATEGORY_MUTATION_STATUS.deleted:
        return createJsonResponse(
          { message: CATEGORY_ROUTE_RESPONSE.deleteSuccessMessage },
          HTTP_STATUS.ok
        );
      case POST_CATEGORY_MUTATION_STATUS.movedAndDeleted:
        return createJsonResponse(
          { message: CATEGORY_ROUTE_RESPONSE.movedAndDeletedMessage },
          HTTP_STATUS.ok
        );
      case POST_CATEGORY_MUTATION_STATUS.categoryHasPosts:
        return createJsonResponse(
          { message: CATEGORY_ROUTE_RESPONSE.categoryHasPostsMessage },
          HTTP_STATUS.badRequest
        );
      case POST_CATEGORY_MUTATION_STATUS.invalidCategory:
        return createJsonResponse(
          { message: CATEGORY_ROUTE_RESPONSE.invalidCategoryMessage },
          HTTP_STATUS.badRequest
        );
      case POST_CATEGORY_MUTATION_STATUS.lastCategory:
        return createJsonResponse(
          { message: CATEGORY_ROUTE_RESPONSE.lastCategoryMessage },
          HTTP_STATUS.badRequest
        );
      case POST_CATEGORY_MUTATION_STATUS.notFound:
        return createJsonResponse(
          { message: CATEGORY_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case POST_CATEGORY_MUTATION_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: CATEGORY_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      message: CATEGORY_ROUTE_LOG.deleteFailureMessage,
      error,
      metadata: {
        categoryId,
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: CATEGORY_ROUTE_RESPONSE.unexpectedDeleteMessage },
      HTTP_STATUS.serverError
    );
  }
}
