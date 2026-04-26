import { createCommunityPost } from "@/src/modules/posts/application/use-cases/create-community-post-use-case";
import { createPostComment } from "@/src/modules/posts/application/use-cases/create-post-comment-use-case";
import { togglePostLike } from "@/src/modules/posts/application/use-cases/toggle-post-like-use-case";

describe("post mutation use cases", () => {
  it("creates a community post when content is valid", async () => {
    const create = jest.fn(async () => ({ status: "created" as const }));
    const execute = createCommunityPost({
      postCreationRepository: { create },
    });

    await expect(
      execute({
        authorId: "member-1",
        communitySlug: "matematica-pro",
        content: "Primera publicación",
      })
    ).resolves.toEqual({ status: "created" });
    expect(create).toHaveBeenCalledWith({
      authorId: "member-1",
      communitySlug: "matematica-pro",
      content: "Primera publicación",
    });
  });

  it("rejects a blank community post before calling the repository", async () => {
    const create = jest.fn();
    const execute = createCommunityPost({
      postCreationRepository: { create },
    });

    await expect(
      execute({
        authorId: "member-1",
        communitySlug: "matematica-pro",
        content: "   ",
      })
    ).resolves.toEqual({ status: "invalid_content" });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a flat post comment when content is valid", async () => {
    const create = jest.fn(async () => ({ status: "created" as const }));
    const execute = createPostComment({
      postCommentRepository: { create },
    });

    await expect(
      execute({
        authorId: "member-1",
        communitySlug: "matematica-pro",
        content: "Excelente clase",
        postId: "post-1",
      })
    ).resolves.toEqual({ status: "created" });
  });

  it("toggles a like reaction idempotently", async () => {
    const toggle = jest.fn(async () => ({ likedByViewer: true, status: "liked" as const }));
    const execute = togglePostLike({
      postReactionRepository: { toggle },
    });

    await expect(
      execute({
        communitySlug: "matematica-pro",
        postId: "post-1",
        userId: "member-1",
      })
    ).resolves.toEqual({
      likedByViewer: true,
      status: "liked",
    });
  });
});
