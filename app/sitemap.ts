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
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";

/**
 * Returns indexable public URLs for search crawlers.
 *
 * @returns Sitemap metadata consumed by Next.js to render /sitemap.xml.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const publicAppBaseUrl = resolvePublicAppBaseUrl();

  return [
    {
      url: publicAppBaseUrl + INDEXABLE_ROUTES.home,
      changeFrequency: SITEMAP_CHANGE_FREQUENCY,
      priority: 1,
    },
  ];
}
