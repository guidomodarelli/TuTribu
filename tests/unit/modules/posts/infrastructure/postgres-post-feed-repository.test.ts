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
  const channelRows = [
    {
      access_scope: "tribemates",
      emoji: "💬",
      id: "channel-general",
      name: "General",
      slug: "general",
      sort_order: 20,
    },
  ];

  it("maps feed rows into posts with comments and reactions", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: channelRows })
      .mockResolvedValueOnce({
        rows: [
          {
          channel_access_scope: "tribemates",
          channel_emoji: "💬",
          channel_id: "channel-general",
          channel_name: "General",
          channel_slug: "general",
          channel_sort_order: 20,
          post_id: "post-1",
          post_content: "Bienvenida",
          post_created_at: "2026-04-26T12:00:00.000Z",
          post_title: "Anuncio inicial",
          author_id: "leader-1",
          author_name: "Ada Lovelace",
          author_image: null,
          author_role: "leader",
          like_count: "2",
          liked_by_viewer: true,
          comment_id: "comment-1",
          comment_content: "Gracias",
          comment_created_at: "2026-04-26T12:05:00.000Z",
          comment_author_id: "member-1",
          comment_author_name: "Grace Hopper",
          comment_author_image: null,
          comment_author_role: "tribemate",
          viewer_membership_status: "active",
          },
        ],
      });
    const repository = new PostgresPostFeedRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toEqual({
      activeChannelId: null,
      channels: [
        {
          accessScope: "tribemates",
          emoji: "💬",
          id: "channel-general",
          name: "General",
          slug: "general",
          sortOrder: 20,
        },
      ],
      viewerPermissions: {
        canComment: true,
        canCreatePost: true,
        canReact: true,
      },
      posts: [
        {
          id: "post-1",
          channel: {
            accessScope: "tribemates",
            emoji: "💬",
            id: "channel-general",
            name: "General",
            slug: "general",
            sortOrder: 20,
          },
          author: {
            id: "leader-1",
            name: "Ada Lovelace",
            role: "leader",
            avatarFallback: "AL",
            image: null,
          },
          comments: [
            {
              id: "comment-1",
              author: {
                id: "member-1",
                name: "Grace Hopper",
                role: "tribemate",
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

    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain(
      "order by posts.created_at desc, post_comments.created_at asc"
    );
  });

  it("returns viewer permissions when the tribe has no posts yet", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: channelRows })
      .mockResolvedValueOnce({
        rows: [
          {
          channel_access_scope: null,
          channel_emoji: null,
          channel_id: null,
          channel_name: null,
          channel_slug: null,
          channel_sort_order: null,
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
      });
    const repository = new PostgresPostFeedRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toEqual({
      activeChannelId: null,
      channels: [
        {
          accessScope: "tribemates",
          emoji: "💬",
          id: "channel-general",
          name: "General",
          slug: "general",
          sortOrder: 20,
        },
      ],
      viewerPermissions: {
        canComment: true,
        canCreatePost: true,
        canReact: true,
      },
      posts: [],
    });
  });

  it("uses preaggregated like counts so comments do not multiply reactions", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: channelRows })
      .mockResolvedValueOnce({
        rows: [
          {
          channel_access_scope: "tribemates",
          channel_emoji: "💬",
          channel_id: "channel-general",
          channel_name: "General",
          channel_slug: "general",
          channel_sort_order: 20,
          post_id: "post-1",
          post_content: "Bienvenida",
          post_created_at: "2026-04-26T12:00:00.000Z",
          post_title: "Anuncio inicial",
          author_id: "leader-1",
          author_name: "Ada Lovelace",
          author_image: null,
          author_role: "leader",
          like_count: "1",
          liked_by_viewer: true,
          comment_id: "comment-1",
          comment_content: "Gracias",
          comment_created_at: "2026-04-26T12:05:00.000Z",
          comment_author_id: "member-1",
          comment_author_name: "Grace Hopper",
          comment_author_image: null,
          comment_author_role: "tribemate",
          viewer_membership_status: "active",
          },
          {
          channel_access_scope: "tribemates",
          channel_emoji: "💬",
          channel_id: "channel-general",
          channel_name: "General",
          channel_slug: "general",
          channel_sort_order: 20,
          post_id: "post-1",
          post_content: "Bienvenida",
          post_created_at: "2026-04-26T12:00:00.000Z",
          post_title: "Anuncio inicial",
          author_id: "leader-1",
          author_name: "Ada Lovelace",
          author_image: null,
          author_role: "leader",
          like_count: "1",
          liked_by_viewer: true,
          comment_id: "comment-2",
          comment_content: "Vamos",
          comment_created_at: "2026-04-26T12:06:00.000Z",
          comment_author_id: "member-2",
          comment_author_name: "Katherine Johnson",
          comment_author_image: null,
          comment_author_role: "tribemate",
          viewer_membership_status: "active",
          },
        ],
      });
    const repository = new PostgresPostFeedRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toMatchObject({
      posts: [
        {
          id: "post-1",
          likeCount: 1,
          comments: [
            { id: "comment-1" },
            { id: "comment-2" },
          ],
        },
      ],
    });

    const sqlText = getSqlText(execute.mock.calls[1]?.[0]);

    expect(sqlText).toContain("post_like_counts");
    expect(sqlText).toContain("with target_tribe as");
    expect(sqlText).toContain("where tribes.slug =");
    expect(sqlText).toContain("inner join public.posts liked_posts");
    expect(sqlText).toContain("on target_tribe.id = liked_posts.tribe_id");
    expect(sqlText).toContain("and posts.channel_id is not null");
    expect(sqlText).toContain("and channel_matches.tribe_id = target_tribe.id");
    expect(sqlText).not.toContain("count(post_reactions.id) filter");
  });
});
