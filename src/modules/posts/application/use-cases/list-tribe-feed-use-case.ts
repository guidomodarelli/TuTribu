import type { TribeFeedResult } from "@/src/modules/posts/application/results/tribe-feed-result";
import type {
  ListTribeFeedQuery,
  PostFeedReadRepository,
} from "@/src/modules/posts/domain/repositories/post-feed-read-repository";

type ListTribeFeedDependencies = {
  postFeedReadRepository: PostFeedReadRepository;
};

export function listTribeFeed({
  postFeedReadRepository,
}: ListTribeFeedDependencies) {
  return async (
    query: ListTribeFeedQuery
  ): Promise<TribeFeedResult> =>
    postFeedReadRepository.listByTribeSlug({
      tribeSlug: query.tribeSlug.trim(),
      viewerId: query.viewerId,
    });
}
