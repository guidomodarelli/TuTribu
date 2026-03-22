import { listCommunityPosts } from "@/src/features/community/repository";

describe("listCommunityPosts", () => {
  it("returns community posts with nested author information", async () => {
    await expect(listCommunityPosts()).resolves.toEqual(
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
