import { createListCommunityPostsUseCase } from "@/src/modules/community/infrastructure/composition/create-list-community-posts-use-case";

describe("createListCommunityPostsUseCase", () => {
  it("returns community posts with nested author information", async () => {
    const useCase = createListCommunityPostsUseCase();

    await expect(useCase.execute()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          title: expect.any(String),
          excerpt: expect.any(String),
          replyCount: expect.any(Number),
          author: expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            role: expect.any(String),
          }),
        }),
      ])
    );
  });
});
