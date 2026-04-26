import { createCommunityPost } from "@/src/modules/posts/application/use-cases/create-community-post-use-case";
import { createPostComment } from "@/src/modules/posts/application/use-cases/create-post-comment-use-case";
import { togglePostLike } from "@/src/modules/posts/application/use-cases/toggle-post-like-use-case";

describe("post mutation use cases", () => {
  it("creates a community post when content is valid", async () => {
    const createdPost = {
      id: "post-1",
      author: {
        id: "member-1",
        name: "Grace Hopper",
        role: "member" as const,
        avatarFallback: "GH",
        image: null,
      },
      comments: [],
      content: "Primera publicación",
      createdAt: "2026-04-26T12:00:00.000Z",
      likedByViewer: false,
      likeCount: 0,
      title: "Bienvenida",
    };
    const create = jest.fn(async () => ({
      post: createdPost,
      status: "created" as const,
    }));
    const execute = createCommunityPost({
      postCreationRepository: { create },
    });

    await expect(
      execute({
        authorId: "member-1",
        communitySlug: "matematica-pro",
        content: "Primera publicación",
        title: "Bienvenida",
      })
    ).resolves.toEqual({ post: createdPost, status: "created" });
    expect(create).toHaveBeenCalledWith({
      authorId: "member-1",
      communitySlug: "matematica-pro",
      content: "Primera publicación",
      title: "Bienvenida",
    });
  });

  it("rejects a blank community post title before calling the repository", async () => {
    const create = jest.fn();
    const execute = createCommunityPost({
      postCreationRepository: { create },
    });

    await expect(
      execute({
        authorId: "member-1",
        communitySlug: "matematica-pro",
        content: "Primera publicación",
        title: "   ",
      })
    ).resolves.toEqual({ status: "invalid_content" });
    expect(create).not.toHaveBeenCalled();
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
        title: "Bienvenida",
      })
    ).resolves.toEqual({ status: "invalid_content" });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a flat post comment when content is valid", async () => {
    const createdComment = {
      id: "comment-1",
      author: {
        id: "member-1",
        name: "Grace Hopper",
        role: "member" as const,
        avatarFallback: "GH",
        image: null,
      },
      content: "Excelente clase",
      createdAt: "2026-04-26T12:05:00.000Z",
    };
    const create = jest.fn(async () => ({
      comment: createdComment,
      status: "created" as const,
    }));
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
    ).resolves.toEqual({ comment: createdComment, status: "created" });
  });

  it("toggles a like reaction idempotently", async () => {
    const toggle = jest.fn(async () => ({
      likedByViewer: true,
      likeCount: 3,
      status: "liked" as const,
    }));
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
      likeCount: 3,
      status: "liked",
    });
  });
});
