import type { CommunityPostRepository } from "../../domain/repositories/community-post-repository";
import type { CommunityPostSummaryResult } from "../results/community-post-summary-result";

export class ListCommunityPostsUseCase {
  constructor(private readonly communityPostRepository: CommunityPostRepository) {}

  async execute(): Promise<CommunityPostSummaryResult[]> {
    const posts = await this.communityPostRepository.listCommunityPosts();

    return posts.map((post) => ({
      ...post,
      author: { ...post.author },
    }));
  }
}
