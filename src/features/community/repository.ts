import { communityPostMocks } from "./mocks";
import type { CommunityPostSummary } from "./types";

export async function listCommunityPosts(): Promise<CommunityPostSummary[]> {
  return communityPostMocks.map((post) => ({
    ...post,
    author: { ...post.author },
  }));
}
