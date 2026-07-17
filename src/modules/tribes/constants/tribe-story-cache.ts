export const TRIBE_STORY_ABOUT_CACHE_LIFE = {
  expire: 300,
  revalidate: 60,
  stale: 30,
} as const;

export const TRIBE_STORY_ABOUT_CACHE_REVALIDATION_PROFILE = {
  expire: 0,
} as const;

const TRIBE_STORY_ABOUT_CACHE_TAG_PREFIX = "tribe-story-about";

export function getTribeStoryAboutCacheTag(tribeSlug: string): string {
  return `${TRIBE_STORY_ABOUT_CACHE_TAG_PREFIX}:${tribeSlug.trim().toLowerCase()}`;
}
