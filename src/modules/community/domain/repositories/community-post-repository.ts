import type { CommunityPost } from "../entities/community-post";

export interface CommunityPostRepository {
  listCommunityPosts(): Promise<CommunityPost[]>;
}
