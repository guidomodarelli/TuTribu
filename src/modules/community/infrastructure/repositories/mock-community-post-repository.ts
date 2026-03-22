import type { CommunityPost } from "@/src/modules/community/domain/entities/community-post";
import type { CommunityPostRepository } from "@/src/modules/community/domain/repositories/community-post-repository";

import { communityPostMockDtos } from "../api/dto/community-post-mock-dto";
import { mapCommunityPostDtoToEntity } from "../api/mapper";

export class MockCommunityPostRepository implements CommunityPostRepository {
  async listCommunityPosts(): Promise<CommunityPost[]> {
    const posts = communityPostMockDtos.map(mapCommunityPostDtoToEntity);

    return posts.map((post) => ({
      ...post,
      author: { ...post.author },
    }));
  }
}
