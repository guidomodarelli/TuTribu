import { revalidateTag } from "next/cache";

import {
  getTribeRoundCacheTag,
  TRIBE_ROUND_CACHE_REVALIDATION_PROFILE,
} from "@/src/modules/messages/constants/tribe-round-cache";

export function revalidateTribeRoundCache(tribeSlug: string): void {
  revalidateTag(
    getTribeRoundCacheTag(tribeSlug),
    TRIBE_ROUND_CACHE_REVALIDATION_PROFILE
  );
}
