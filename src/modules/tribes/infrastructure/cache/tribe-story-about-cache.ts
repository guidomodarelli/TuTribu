import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import {
  getTribeStoryAboutCacheTag,
  TRIBE_STORY_ABOUT_CACHE_LIFE,
} from "@/src/modules/tribes/constants/tribe-story-cache";
import type {
  TribeStoryResult,
  TribeStoryStatsResult,
} from "@/src/modules/tribes/application/results/tribe-story-result";
import { PostgresTribeStoryRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-story-repository";
import { createServerDatabaseClient } from "@/src/modules/shared/infrastructure/database/server-database-client";

type RequestScopedDatabaseClient = Awaited<
  ReturnType<typeof createServerDatabaseClient>
>;

export type PublicTribeStoryAboutSnapshot = {
  stats: TribeStoryStatsResult | null;
  story: TribeStoryResult | null;
};

/**
 * Cached anonymous snapshot of the public tribe story about page.
 *
 * The read runs with an empty app-user context, so the RLS definer functions
 * return exactly what an anonymous visitor may see (nothing unless the tribe
 * exposes a live open-join offer). Serving it only to anonymous viewers keeps
 * the per-viewer RLS decisions intact for members and logged-in visitors while
 * collapsing crawler and logged-out traffic into one short-lived cache entry.
 */
export async function getCachedPublicTribeStoryAbout(
  tribeSlug: string
): Promise<PublicTribeStoryAboutSnapshot> {
  "use cache";

  cacheLife(TRIBE_STORY_ABOUT_CACHE_LIFE);
  cacheTag(getTribeStoryAboutCacheTag(tribeSlug));

  const databaseClient = await createServerDatabaseClient();
  const executeWithAnonymousContext = <T>(
    callback: Parameters<RequestScopedDatabaseClient["withRequestContext"]>[1]
  ) =>
    databaseClient.withRequestContext(
      {
        email: null,
        userId: null,
      },
      callback
    ) as Promise<T>;
  const tribeStoryRepository = new PostgresTribeStoryRepository(
    executeWithAnonymousContext
  );

  const [story, stats] = await Promise.all([
    tribeStoryRepository.getByTribeSlug({ tribeSlug }),
    tribeStoryRepository.getStatsByTribeSlug({ tribeSlug }),
  ]);

  return { stats, story };
}
