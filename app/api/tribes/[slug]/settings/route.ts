import { TRIBE_IMAGE_SAVE_STATUS } from "@/src/modules/tribes/constants/tribe-images";
import { revalidateTribeStoryAboutCache } from "@/src/modules/tribes/infrastructure/cache/tribe-story-about-cache-revalidation";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";
import { isHttpUrl, readPayloadObjectBody, readTrimmedText } from "@/app/api/request-body-fields";

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

const MEMBER_ROUTE_SCOPE = {
  feature: SETTINGS_ROUTE_LOG.feature,
  operation: SETTINGS_ROUTE_LOG.operation,
  unauthorizedMessage: SETTINGS_ROUTE_RESPONSE.unauthorizedMessage,
} as const;

/**
 * Saves the tribe visual identity (logo and cover). Authorization is enforced
 * by the leader-guarded definer behind the repository, so a non-leader request
 * resolves to a forbidden status instead of writing.
 */
export async function PUT(
  request: Request,
  context: TribeRouteContext
) {
  const { slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: SETTINGS_ROUTE_LOG.saveFailureMessage,
      metadata: { slug },
      responseMessage: SETTINGS_ROUTE_RESPONSE.unexpectedSaveMessage,
    },
    async ({ modules }) => {
      const parsedBody = await readPayloadObjectBody(request);

      if (!parsedBody) {
        return createRouteJsonResponse(
          { message: SETTINGS_ROUTE_RESPONSE.invalidBodyMessage },
          HTTP_STATUS.badRequest
        );
      }

      const logoUrl = readTrimmedText(parsedBody.logoUrl);

      if (logoUrl && !isHttpUrl(logoUrl)) {
        return createRouteJsonResponse(
          { message: SETTINGS_ROUTE_RESPONSE.invalidLogoUrlMessage },
          HTTP_STATUS.badRequest
        );
      }

      const coverUrl = readTrimmedText(parsedBody.coverUrl);

      if (coverUrl && !isHttpUrl(coverUrl)) {
        return createRouteJsonResponse(
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

        return createRouteJsonResponse(
          {
            identity: result.identity,
            message: SETTINGS_ROUTE_RESPONSE.savedMessage,
          },
          HTTP_STATUS.ok
        );
      }

      return createRouteJsonResponse(
        { message: SETTINGS_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
    }
  );
}
