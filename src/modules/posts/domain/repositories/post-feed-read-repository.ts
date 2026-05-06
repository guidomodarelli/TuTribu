import type { TribeFeedResult } from "@/src/modules/posts/application/results/tribe-feed-result";

export type ListTribeFeedQuery = {
  tribeSlug: string;
  viewerId: string;
};

export interface PostFeedReadRepository {
  listByTribeSlug(query: ListTribeFeedQuery): Promise<TribeFeedResult>;
}
