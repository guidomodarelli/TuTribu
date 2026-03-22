import { ListCommunityPostsUseCase } from "@/src/modules/community/application/use-cases/list-community-posts-use-case";
import type { CommunityPostRepository } from "@/src/modules/community/domain/repositories/community-post-repository";

describe("ListCommunityPostsUseCase", () => {
  it("returns post summaries with author profile from the repository port", async () => {
    const communityPostRepository: CommunityPostRepository = {
      listCommunityPosts: jest.fn().mockResolvedValue([
        {
          id: "post-1",
          title: "Weekly wins",
          excerpt: "A checkpoint thread",
          replyCount: 4,
          publishedAt: "Monday, March 17",
          author: {
            id: "member-1",
            name: "Sofia",
            role: "Host",
            avatarFallback: "SF",
          },
        },
      ]),
    };

    const useCase = new ListCommunityPostsUseCase(communityPostRepository);

    const result = await useCase.execute();

    expect(communityPostRepository.listCommunityPosts).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        id: "post-1",
        title: "Weekly wins",
        excerpt: "A checkpoint thread",
        replyCount: 4,
        publishedAt: "Monday, March 17",
        author: {
          id: "member-1",
          name: "Sofia",
          role: "Host",
          avatarFallback: "SF",
        },
      },
    ]);
  });
});
