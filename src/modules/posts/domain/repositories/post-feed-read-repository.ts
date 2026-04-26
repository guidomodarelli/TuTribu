import type { CommunityFeedResult } from "@/src/modules/posts/application/results/community-feed-result";

export type ListCommunityFeedQuery = {
  communitySlug: string;
  viewerId: string;
};

export interface PostFeedReadRepository {
  listByCommunitySlug(query: ListCommunityFeedQuery): Promise<CommunityFeedResult>;
}
