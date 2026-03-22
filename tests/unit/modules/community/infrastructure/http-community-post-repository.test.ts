import { HttpCommunityPostRepository } from "@/src/modules/community/infrastructure/repositories/http-community-post-repository";

describe("HttpCommunityPostRepository", () => {
  it("requests community posts from backend and maps DTOs", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "post-1",
            title: "Weekly wins",
            excerpt: "Checkpoint",
            replyCount: 3,
            publishedAt: "Monday, March 17",
            author: {
              id: "member-1",
              name: "Sofia",
              role: "Host",
              avatarFallback: "SF",
            },
          },
        ],
      }),
    });

    const repository = new HttpCommunityPostRepository(
      "https://api.academia.test",
      fetcher
    );

    const result = await repository.listCommunityPosts();

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.academia.test/v1/community/posts",
      expect.objectContaining({
        method: "GET",
      })
    );
    expect(result).toEqual([
      {
        id: "post-1",
        title: "Weekly wins",
        excerpt: "Checkpoint",
        replyCount: 3,
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
