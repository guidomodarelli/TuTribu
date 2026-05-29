/**
 * Generates the public robots.txt metadata route.
 *
 * @module robots
 */

import type { MetadataRoute } from "next";

import {
  DISALLOWED_CRAWLER_ROUTES,
  INDEXABLE_ROUTES,
  SITEMAP_PATH,
} from "@/src/constants/search-indexing";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";

/**
 * Returns crawler directives for public and internal application paths.
 *
 * @returns Robots metadata consumed by Next.js to render /robots.txt.
 */
export default function robots(): MetadataRoute.Robots {
  const publicAppBaseUrl = resolvePublicAppBaseUrl();

  return {
    rules: {
      userAgent: "*",
      allow: INDEXABLE_ROUTES.home,
      disallow: [...DISALLOWED_CRAWLER_ROUTES],
    },
    sitemap: publicAppBaseUrl + SITEMAP_PATH,
  };
}
