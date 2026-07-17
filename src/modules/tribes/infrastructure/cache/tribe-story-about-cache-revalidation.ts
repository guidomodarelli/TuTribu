import { revalidateTag } from "next/cache";

import {
  getTribeStoryAboutCacheTag,
  TRIBE_STORY_ABOUT_CACHE_REVALIDATION_PROFILE,
} from "@/src/modules/tribes/constants/tribe-story-cache";

export function revalidateTribeStoryAboutCache(tribeSlug: string): void {
  revalidateTag(
    getTribeStoryAboutCacheTag(tribeSlug),
    TRIBE_STORY_ABOUT_CACHE_REVALIDATION_PROFILE
  );
}
