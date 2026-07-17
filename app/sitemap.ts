/**
 * Generates the public sitemap.xml metadata route.
 *
 * @module sitemap
 */

import type { MetadataRoute } from "next";

import {
  INDEXABLE_ROUTES,
  SITEMAP_CHANGE_FREQUENCY,
} from "@/src/constants/search-indexing";
import { ROUTES } from "@/src/constants/routes";
import { createMaintenanceModules } from "@/src/modules/setup";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";

const TRIBE_STORY_SITEMAP_PRIORITY = 0.7;

/**
 * Lists the story pages of publicly joinable tribes. Failures degrade to an
 * empty list so the sitemap always renders the static entries.
 *
 * @param publicAppBaseUrl - Absolute base URL of the deployment.
 * @returns Absolute URLs of indexable tribe story pages.
 */
async function listPublicTribeStoryUrls(
  publicAppBaseUrl: string
): Promise<MetadataRoute.Sitemap> {
  try {
    const modules = await createMaintenanceModules();
    const publicStorySlugs =
      await modules.tribes.useCases.listPublicTribeStorySlugs();

    return publicStorySlugs.map((tribeSlug) => ({
      url: publicAppBaseUrl + ROUTES.tribes.history(tribeSlug),
      changeFrequency: SITEMAP_CHANGE_FREQUENCY,
      priority: TRIBE_STORY_SITEMAP_PRIORITY,
    }));
  } catch {
    // The sitemap must keep serving its static entries when the database is
    // unreachable; crawler traffic is not worth failing the route over.
    return [];
  }
}

/**
 * Returns indexable public URLs for search crawlers.
 *
 * @returns Sitemap metadata consumed by Next.js to render /sitemap.xml.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const publicAppBaseUrl = resolvePublicAppBaseUrl();

  return [
    {
      url: publicAppBaseUrl + INDEXABLE_ROUTES.home,
      changeFrequency: SITEMAP_CHANGE_FREQUENCY,
      priority: 1,
    },
    ...(await listPublicTribeStoryUrls(publicAppBaseUrl)),
  ];
}
