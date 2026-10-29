/**
 * Access gate of the tribe pages that stay reachable for basic academy
 * members without community access (story, support and welcome).
 *
 * @module academy-free-page-access
 */

import {
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/application/results/tribe-page-access-result";
import { createRouteJsonResponse, type RequestModules } from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";

/** Copy answered when the tribe page is hidden from the viewer. */
type HiddenTribePageCopy = {
  accessForbiddenMessage: string;
  notFoundMessage: string;
};

/**
 * Checks the signed-in viewer's access to an academy-free tribe page.
 *
 * @param modules - Request modules of the route.
 * @param slug - Tribe slug.
 * @param copy - Copy of the 403 (blocked) and 404 (any other hidden reason).
 * @returns The response to return when the page is hidden, or `null` when it is visible.
 */
export async function respondToHiddenAcademyFreePage(
  modules: RequestModules,
  slug: string,
  copy: HiddenTribePageCopy
): Promise<Response | null> {
  const accessResult = await modules.tribes.useCases.getTribePageAccess({
    allowWithoutCommunityAccess: true,
    isAuthenticated: true,
    slug,
  });

  if (accessResult.status !== TRIBE_PAGE_ACCESS_STATUS.hidden) {
    return null;
  }

  if (accessResult.reason === TRIBE_PAGE_ACCESS_REASON.blockedHidden) {
    return createRouteJsonResponse(
      { message: copy.accessForbiddenMessage },
      HTTP_STATUS.forbidden
    );
  }

  return createRouteJsonResponse({ message: copy.notFoundMessage }, HTTP_STATUS.notFound);
}
