import { PostgresPostFeedRepository } from "@/src/modules/posts/infrastructure/repositories/postgres-post-feed-repository";

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value: unknown }).value)
      ) {
        return (chunk as { value: string[] }).value.join("");
      }

      return "";
    })
    .join("");
}

describe("PostgresPostFeedRepository", () => {
  it("maps feed rows into posts with comments and reactions", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          post_id: "post-1",
          post_content: "Bienvenida",
          post_created_at: "2026-04-26T12:00:00.000Z",
          post_title: "Anuncio inicial",
          author_id: "owner-1",
          author_name: "Ada Lovelace",
          author_image: null,
          author_role: "owner",
          like_count: "2",
          liked_by_viewer: true,
          comment_id: "comment-1",
          comment_content: "Gracias",
          comment_created_at: "2026-04-26T12:05:00.000Z",
          comment_author_id: "member-1",
          comment_author_name: "Grace Hopper",
          comment_author_image: null,
          comment_author_role: "member",
          viewer_membership_status: "active",
        },
      ],
    }));
    const repository = new PostgresPostFeedRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listByCommunitySlug({
        communitySlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toEqual({
      viewerPermissions: {
        canComment: true,
        canCreatePost: true,
        canReact: true,
      },
      posts: [
        {
          id: "post-1",
          author: {
            id: "owner-1",
            name: "Ada Lovelace",
            role: "owner",
            avatarFallback: "AL",
            image: null,
          },
          comments: [
            {
              id: "comment-1",
              author: {
                id: "member-1",
                name: "Grace Hopper",
                role: "member",
                avatarFallback: "GH",
                image: null,
              },
              content: "Gracias",
              createdAt: "2026-04-26T12:05:00.000Z",
            },
          ],
          content: "Bienvenida",
          createdAt: "2026-04-26T12:00:00.000Z",
          likedByViewer: true,
          likeCount: 2,
          title: "Anuncio inicial",
        },
      ],
    });

    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "order by posts.created_at desc, post_comments.created_at asc"
    );
  });

  it("returns viewer permissions when the community has no posts yet", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          post_id: null,
          post_content: null,
          post_created_at: null,
          post_title: null,
          author_id: null,
          author_name: null,
          author_image: null,
          author_role: null,
          like_count: "0",
          liked_by_viewer: false,
          comment_id: null,
          comment_content: null,
          comment_created_at: null,
          comment_author_id: null,
          comment_author_name: null,
          comment_author_image: null,
          comment_author_role: null,
          viewer_membership_status: "active",
        },
      ],
    }));
    const repository = new PostgresPostFeedRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listByCommunitySlug({
        communitySlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toEqual({
      viewerPermissions: {
        canComment: true,
        canCreatePost: true,
        canReact: true,
      },
      posts: [],
    });
  });
});
