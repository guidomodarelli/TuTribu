import { PostgresMessageRoundRepository } from "@/src/modules/messages/infrastructure/repositories/postgres-message-round-repository";

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

describe("PostgresMessageRoundRepository", () => {
  const channelRows = [
    {
      access_scope: "tribemates",
      emoji: "🔥",
      id: "channel-ronda",
      name: "Ronda",
      slug: "ronda",
      sort_order: 20,
    },
  ];

  it("maps round rows into messages with replies and reactions", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: channelRows })
      .mockResolvedValueOnce({
        rows: [
          {
          channel_access_scope: "tribemates",
          channel_emoji: "🔥",
          channel_id: "channel-ronda",
          channel_name: "Ronda",
          channel_slug: "ronda",
          channel_sort_order: 20,
          message_id: "message-1",
          message_content: "Bienvenida",
          message_created_at: "2026-04-26T12:00:00.000Z",
          message_title: "Anuncio inicial",
          author_id: "leader-1",
          author_name: "Ada Lovelace",
          author_image: null,
          author_role: "leader",
          like_count: "2",
          liked_by_viewer: true,
          message_pinned_at: "2026-04-26T13:00:00.000Z",
          reply_id: "reply-1",
          reply_content: "Gracias",
          reply_created_at: "2026-04-26T12:05:00.000Z",
          reply_author_id: "member-1",
          reply_author_name: "Grace Hopper",
          reply_author_image: null,
          reply_author_role: "tribemate",
          viewer_membership_status: "active",
          viewer_membership_role: "leader",
          },
        ],
      });
    const repository = new PostgresMessageRoundRepository(async (callback) =>
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
          emoji: "🔥",
          id: "channel-ronda",
          name: "Ronda",
          slug: "ronda",
          sortOrder: 20,
        },
      ],
      viewerPermissions: {
        canReply: true,
        canCreateMessage: true,
        canReact: true,
        canPinMessages: true,
      },
      messages: [
        {
          id: "message-1",
          channel: {
            accessScope: "tribemates",
            emoji: "🔥",
            id: "channel-ronda",
            name: "Ronda",
            slug: "ronda",
            sortOrder: 20,
          },
          author: {
            id: "leader-1",
            name: "Ada Lovelace",
            role: "leader",
            avatarFallback: "AL",
            image: null,
          },
          replies: [
            {
              id: "reply-1",
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
          isPinned: true,
          pinnedAt: "2026-04-26T13:00:00.000Z",
          title: "Anuncio inicial",
        },
      ],
    });

    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain(
      "order by message_pins.pinned_at desc nulls last, messages.created_at desc, message_replies.created_at asc"
    );
  });

  it("returns viewer permissions when the tribe has no messages yet", async () => {
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
          message_id: null,
          message_content: null,
          message_created_at: null,
          message_title: null,
          author_id: null,
          author_name: null,
          author_image: null,
          author_role: null,
          like_count: "0",
          liked_by_viewer: false,
          message_pinned_at: null,
          reply_id: null,
          reply_content: null,
          reply_created_at: null,
          reply_author_id: null,
          reply_author_name: null,
          reply_author_image: null,
          reply_author_role: null,
          viewer_membership_status: "active",
          viewer_membership_role: "tribemate",
          },
        ],
      });
    const repository = new PostgresMessageRoundRepository(async (callback) =>
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
          emoji: "🔥",
          id: "channel-ronda",
          name: "Ronda",
          slug: "ronda",
          sortOrder: 20,
        },
      ],
      viewerPermissions: {
        canReply: true,
        canCreateMessage: true,
        canReact: true,
        canPinMessages: false,
      },
      messages: [],
    });
  });

  it("uses preaggregated like counts so replies do not multiply reactions", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: channelRows })
      .mockResolvedValueOnce({
        rows: [
          {
          channel_access_scope: "tribemates",
          channel_emoji: "🔥",
          channel_id: "channel-ronda",
          channel_name: "Ronda",
          channel_slug: "ronda",
          channel_sort_order: 20,
          message_id: "message-1",
          message_content: "Bienvenida",
          message_created_at: "2026-04-26T12:00:00.000Z",
          message_title: "Anuncio inicial",
          author_id: "leader-1",
          author_name: "Ada Lovelace",
          author_image: null,
          author_role: "leader",
          like_count: "1",
          liked_by_viewer: true,
          message_pinned_at: null,
          reply_id: "reply-1",
          reply_content: "Gracias",
          reply_created_at: "2026-04-26T12:05:00.000Z",
          reply_author_id: "member-1",
          reply_author_name: "Grace Hopper",
          reply_author_image: null,
          reply_author_role: "tribemate",
          viewer_membership_status: "active",
          viewer_membership_role: "tribemate",
          },
          {
          channel_access_scope: "tribemates",
          channel_emoji: "🔥",
          channel_id: "channel-ronda",
          channel_name: "Ronda",
          channel_slug: "ronda",
          channel_sort_order: 20,
          message_id: "message-1",
          message_content: "Bienvenida",
          message_created_at: "2026-04-26T12:00:00.000Z",
          message_title: "Anuncio inicial",
          author_id: "leader-1",
          author_name: "Ada Lovelace",
          author_image: null,
          author_role: "leader",
          like_count: "1",
          liked_by_viewer: true,
          message_pinned_at: null,
          reply_id: "reply-2",
          reply_content: "Vamos",
          reply_created_at: "2026-04-26T12:06:00.000Z",
          reply_author_id: "member-2",
          reply_author_name: "Katherine Johnson",
          reply_author_image: null,
          reply_author_role: "tribemate",
          viewer_membership_status: "active",
          viewer_membership_role: "tribemate",
          },
        ],
      });
    const repository = new PostgresMessageRoundRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toMatchObject({
      messages: [
        {
          id: "message-1",
          likeCount: 1,
          replies: [
            { id: "reply-1" },
            { id: "reply-2" },
          ],
        },
      ],
    });

    const sqlText = getSqlText(execute.mock.calls[1]?.[0]);

    expect(sqlText).toContain("message_like_counts");
    expect(sqlText).toContain("left join public.message_pins");
    expect(sqlText).toContain("message_pins.pinned_at as message_pinned_at");
    expect(sqlText).toContain("with target_tribe as");
    expect(sqlText).toContain("where tribes.slug =");
    expect(sqlText).toContain("inner join public.messages liked_messages");
    expect(sqlText).toContain("on target_tribe.id = liked_messages.tribe_id");
    expect(sqlText).toContain("and messages.channel_id is not null");
    expect(sqlText).toContain("and channel_matches.tribe_id = target_tribe.id");
    expect(sqlText).not.toContain("count(message_reactions.id) filter");
  });
});
