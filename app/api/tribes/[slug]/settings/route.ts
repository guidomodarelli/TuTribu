import { createRequestModules } from "@/src/modules/setup";
import { TRIBE_IMAGE_SAVE_STATUS } from "@/src/modules/tribes/constants/tribe-images";
import { revalidateTribeStoryAboutCache } from "@/src/modules/tribes/infrastructure/cache/tribe-story-about-cache-revalidation";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const SETTINGS_ROUTE_LOG = {
  feature: "tribes",
  operation: "manage-tribe-settings",
  saveFailureMessage: "Tribe identity save failed",
} as const;

const SETTINGS_ROUTE_RESPONSE = {
  forbiddenMessage: "Solo el líder puede editar los ajustes de la tribu.",
  invalidBodyMessage: "Revisá los ajustes antes de guardar.",
  invalidCoverUrlMessage:
    "Ingresá una URL de portada válida que empiece con http:// o https://",
  invalidLogoUrlMessage:
    "Ingresá una URL de logo válida que empiece con http:// o https://",
  savedMessage: "Ajustes actualizados.",
  unauthorizedMessage: "Iniciá sesión para gestionar los ajustes.",
  unexpectedSaveMessage: "No pudimos guardar los ajustes. Intentá de nuevo.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  forbidden: 403,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

const SETTINGS_URL_PROTOCOL = {
  http: "http:",
  https: "https:",
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

function readOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value);

    return (
      parsedUrl.protocol === SETTINGS_URL_PROTOCOL.http ||
      parsedUrl.protocol === SETTINGS_URL_PROTOCOL.https
    );
  } catch {
    return false;
  }
}

/**
 * Saves the tribe visual identity (logo and cover). Authorization is enforced
 * by the leader-guarded definer behind the repository, so a non-leader request
 * resolves to a forbidden status instead of writing.
 */
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
    feature: SETTINGS_ROUTE_LOG.feature,
    operation: SETTINGS_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember =
    await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: SETTINGS_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const parsedBody = await request.json().catch(() => ({}));

    if (!isPayloadObject(parsedBody)) {
      return createJsonResponse(
        { message: SETTINGS_ROUTE_RESPONSE.invalidBodyMessage },
        HTTP_STATUS.badRequest
      );
    }

    const logoUrl = readOptionalText(parsedBody.logoUrl);

    if (logoUrl && !isHttpUrl(logoUrl)) {
      return createJsonResponse(
        { message: SETTINGS_ROUTE_RESPONSE.invalidLogoUrlMessage },
        HTTP_STATUS.badRequest
      );
    }

    const coverUrl = readOptionalText(parsedBody.coverUrl);

    if (coverUrl && !isHttpUrl(coverUrl)) {
      return createJsonResponse(
        { message: SETTINGS_ROUTE_RESPONSE.invalidCoverUrlMessage },
        HTTP_STATUS.badRequest
      );
    }

    const result = await modules.tribes.useCases.saveTribeIdentity({
      coverUrl,
      logoUrl,
      tribeSlug: slug,
    });

    if (result.status === TRIBE_IMAGE_SAVE_STATUS.updated) {
      revalidateTribeStoryAboutCache(slug);

      return createJsonResponse(
        {
          identity: result.identity,
          message: SETTINGS_ROUTE_RESPONSE.savedMessage,
        },
        HTTP_STATUS.ok
      );
    }

    return createJsonResponse(
      { message: SETTINGS_ROUTE_RESPONSE.forbiddenMessage },
      HTTP_STATUS.forbidden
    );
  } catch (error) {
    logger.error({
      error,
      message: SETTINGS_ROUTE_LOG.saveFailureMessage,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: SETTINGS_ROUTE_RESPONSE.unexpectedSaveMessage },
      HTTP_STATUS.serverError
    );
  }
}
