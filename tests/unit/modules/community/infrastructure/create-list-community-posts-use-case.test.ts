import { createListCommunityPostsUseCase } from "@/src/modules/community/infrastructure/composition/create-list-community-posts-use-case";

describe("createListCommunityPostsUseCase", () => {
  const originalEnv = process.env.ACADEMIA_BACKEND_BASE_URL;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.ACADEMIA_BACKEND_BASE_URL = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("uses mock repository when backend base url is missing", async () => {
    delete process.env.ACADEMIA_BACKEND_BASE_URL;
    global.fetch = jest.fn() as unknown as typeof fetch;

    const useCase = createListCommunityPostsUseCase();
    const result = await useCase.execute();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.length).toBeGreaterThan(0);
  });

  it("uses http repository when backend base url exists", async () => {
    process.env.ACADEMIA_BACKEND_BASE_URL = "https://api.academia.test";
    global.fetch = jest.fn().mockResolvedValue({
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
    }) as unknown as typeof fetch;

    const useCase = createListCommunityPostsUseCase();
    await useCase.execute();

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.academia.test/v1/community/posts",
      expect.objectContaining({ method: "GET" })
    );
  });
});
