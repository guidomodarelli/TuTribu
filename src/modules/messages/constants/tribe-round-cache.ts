export const TRIBE_ROUND_SHARED_CACHE_LIFE = {
  expire: 300,
  revalidate: 60,
  stale: 30,
} as const;

export const TRIBE_ROUND_CACHE_REVALIDATION_PROFILE = { expire: 0 } as const;

const TRIBE_ROUND_CACHE_TAG_PREFIX = "tribe-round";
const TRIBE_ROUND_CACHE_TAG_SEPARATOR = ":";

export function getTribeRoundCacheTag(tribeSlug: string): string {
  return `${TRIBE_ROUND_CACHE_TAG_PREFIX}${TRIBE_ROUND_CACHE_TAG_SEPARATOR}${tribeSlug.trim().toLowerCase()}`;
}
