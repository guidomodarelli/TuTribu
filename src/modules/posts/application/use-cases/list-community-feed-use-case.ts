import type { CommunityFeedResult } from "@/src/modules/posts/application/results/community-feed-result";
import type {
  ListCommunityFeedQuery,
  PostFeedReadRepository,
} from "@/src/modules/posts/domain/repositories/post-feed-read-repository";

type ListCommunityFeedDependencies = {
  postFeedReadRepository: PostFeedReadRepository;
};

export function listCommunityFeed({
  postFeedReadRepository,
}: ListCommunityFeedDependencies) {
  return async (
    query: ListCommunityFeedQuery
  ): Promise<CommunityFeedResult> =>
    postFeedReadRepository.listByCommunitySlug({
      communitySlug: query.communitySlug.trim(),
      viewerId: query.viewerId,
    });
}
