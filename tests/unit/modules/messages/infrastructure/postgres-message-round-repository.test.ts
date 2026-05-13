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

  it("maps paginated round rows into messages without loading replies", async () => {
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
            message_pinned_at: "2026-04-26T13:00:00.000Z",
            reply_id: "reply-1",
            reply_content: "Gracias",
            reply_created_at: "2026-04-26T12:05:00.000Z",
            reply_author_id: "member-1",
            reply_author_name: "Grace Hopper",
            reply_author_image: null,
            reply_author_role: "tribemate",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            liked_message_ids: ["message-1"],
            viewer_membership_role: "leader",
            viewer_membership_status: "active",
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
          hasLoadedReplies: false,
          replies: [],
          content: "Bienvenida",
          createdAt: "2026-04-26T12:00:00.000Z",
          likedByViewer: true,
          permissions: {
            canDelete: true,
          },
          likeCount: 2,
          isPinned: true,
          pinnedAt: "2026-04-26T13:00:00.000Z",
          poll: null,
          title: "Anuncio inicial",
        },
      ],
      pagination: {
        currentPage: 1,
        hasNextPage: false,
        hasPreviousPage: false,
        pageSize: 15,
      },
    });

    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain(
      "order by message_pins.pinned_at desc nulls last, messages.created_at desc, messages.id desc"
    );
    expect(getSqlText(execute.mock.calls[1]?.[0])).not.toContain(
      "message_replies"
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
            message_pinned_at: null,
            reply_id: null,
            reply_content: null,
            reply_created_at: null,
            reply_author_id: null,
            reply_author_name: null,
            reply_author_image: null,
            reply_author_role: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            liked_message_ids: [],
            viewer_membership_role: "tribemate",
            viewer_membership_status: "active",
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
      pagination: {
        currentPage: 1,
        hasNextPage: false,
        hasPreviousPage: false,
        pageSize: 15,
      },
    });
  });

  it("blocks own message deletion for muted viewers", async () => {
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
            message_content: "Read-only update",
            message_created_at: "2026-04-26T12:00:00.000Z",
            message_title: "Read-only",
            author_id: "member-1",
            author_name: "Grace Hopper",
            author_image: null,
            author_role: "tribemate",
            like_count: "0",
            message_pinned_at: null,
            reply_id: null,
            reply_content: null,
            reply_created_at: null,
            reply_author_id: null,
            reply_author_name: null,
            reply_author_image: null,
            reply_author_role: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            liked_message_ids: [],
            selected_poll_option_ids: [],
            viewer_membership_role: "tribemate",
            viewer_membership_status: "muted",
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
      viewerPermissions: {
        canCreateMessage: false,
        canPinMessages: false,
        canReact: false,
        canReply: false,
      },
      messages: [
        {
          id: "message-1",
          permissions: {
            canDelete: false,
          },
        },
      ],
    });
  });

  it("uses preaggregated like counts without joining replies", async () => {
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
            message_pinned_at: null,
            reply_id: "reply-1",
            reply_content: "Gracias",
            reply_created_at: "2026-04-26T12:05:00.000Z",
            reply_author_id: "member-1",
            reply_author_name: "Grace Hopper",
            reply_author_image: null,
            reply_author_role: "tribemate",
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
            message_pinned_at: null,
            reply_id: "reply-2",
            reply_content: "Vamos",
            reply_created_at: "2026-04-26T12:06:00.000Z",
            reply_author_id: "member-2",
            reply_author_name: "Katherine Johnson",
            reply_author_image: null,
            reply_author_role: "tribemate",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            liked_message_ids: ["message-1"],
            viewer_membership_role: "tribemate",
            viewer_membership_status: "active",
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
          hasLoadedReplies: false,
          replies: [],
        },
      ],
    });

    const sqlText = getSqlText(execute.mock.calls[1]?.[0]);

    expect(sqlText).toContain("message_like_counts");
    expect(sqlText).toContain("left join public.message_pins");
    expect(sqlText).toContain("messages.pinned_at as message_pinned_at");
    expect(sqlText).toContain("filtered_messages as");
    expect(sqlText).toContain("with target_tribe as");
    expect(sqlText).toContain("where tribes.slug =");
    expect(sqlText).toContain("inner join public.messages liked_messages");
    expect(sqlText).toContain("on target_tribe.id = liked_messages.tribe_id");
    expect(sqlText).toContain("where messages.channel_id is not null");
    expect(sqlText).toContain("and channel_matches.tribe_id = target_tribe.id");
    expect(sqlText).not.toContain("liked_by_viewer");
    expect(sqlText).not.toContain("viewer_membership_status");
    expect(sqlText).not.toContain("message_replies");
    expect(sqlText).not.toContain("count(message_reactions.id) filter");
  });

  it("returns shared round data without viewer-specific reaction state", async () => {
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
            message_pinned_at: "2026-04-26T13:00:00.000Z",
            reply_id: null,
            reply_content: null,
            reply_created_at: null,
            reply_author_id: null,
            reply_author_name: null,
            reply_author_image: null,
            reply_author_role: null,
          },
        ],
      });
    const repository = new PostgresMessageRoundRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listSharedDataByTribeSlug({
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
      messages: [
        expect.not.objectContaining({
          likedByViewer: expect.any(Boolean),
        }),
      ],
      pagination: {
        currentPage: 1,
        hasNextPage: false,
        hasPreviousPage: false,
        pageSize: 15,
      },
    });

    const sqlText = getSqlText(execute.mock.calls[1]?.[0]);

    expect(sqlText).not.toContain("liked_by_viewer");
    expect(sqlText).not.toContain("viewer_membership_status");
  });

  it("groups shared round CTE message columns required by PostgreSQL", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: channelRows })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresMessageRoundRepository(async (callback) =>
      callback({ execute } as never)
    );

    await repository.listSharedDataByTribeSlug({
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });

    const sqlText = getSqlText(execute.mock.calls[1]?.[0]);
    const groupByText = sqlText.slice(
      sqlText.lastIndexOf("group by"),
      sqlText.indexOf("order by messages.pinned_at")
    );

    expect(groupByText).toContain("messages.id");
    expect(groupByText).toContain("messages.title");
    expect(groupByText).toContain("messages.content");
    expect(groupByText).toContain("messages.created_at");
    expect(groupByText).toContain("messages.like_count");
    expect(groupByText).toContain("messages.pinned_at");
  });

  it("filters shared round data by channel and detects the next page", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: channelRows })
      .mockResolvedValueOnce({
        rows: Array.from({ length: 16 }, (_, index) => ({
          channel_access_scope: "tribemates",
          channel_emoji: "🔥",
          channel_id: "channel-ronda",
          channel_name: "Ronda",
          channel_slug: "ronda",
          channel_sort_order: 20,
          message_id: `message-${index + 1}`,
          message_content: "Bienvenida",
          message_created_at: "2026-04-26T12:00:00.000Z",
          message_title: "Anuncio inicial",
          author_id: "leader-1",
          author_name: "Ada Lovelace",
          author_image: null,
          author_role: "leader",
          like_count: "2",
          message_pinned_at: null,
        })),
      });
    const repository = new PostgresMessageRoundRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listSharedDataByTribeSlug({
        channelSlug: "ronda",
        page: 2,
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toMatchObject({
      activeChannelId: "channel-ronda",
      messages: expect.arrayContaining([
        expect.objectContaining({ id: "message-1" }),
      ]),
      pagination: {
        currentPage: 2,
        hasNextPage: true,
        hasPreviousPage: true,
        pageSize: 15,
      },
    });

    const sqlText = getSqlText(execute.mock.calls[1]?.[0]);

    expect(sqlText).toContain("selected_channel.slug");
    expect(sqlText).toContain("limit");
    expect(sqlText).toContain("offset");
  });

  it("lists message replies separately from the shared round", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          status_result: "found",
          reply_id: "reply-1",
          reply_content: "Gracias",
          reply_created_at: "2026-04-26T12:05:00.000Z",
          reply_author_id: "member-1",
          reply_author_name: "Grace Hopper",
          reply_author_image: null,
          reply_author_role: "tribemate",
        },
      ],
    });
    const repository = new PostgresMessageRoundRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listRepliesByMessageId({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toEqual({
      status: "found",
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
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("message_replies");
    expect(sqlText).toContain("order by message_replies.created_at asc");
  });

  it("returns viewer state separately from shared message rows", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          liked_message_ids: ["message-1", "message-2"],
          viewer_membership_role: "guardian",
          viewer_membership_status: "active",
        },
      ],
    });
    const repository = new PostgresMessageRoundRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listViewerStateByTribeSlug({
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toEqual({
      likedMessageIds: ["message-1", "message-2"],
      selectedPollOptionIds: [],
      viewerId: "member-1",
      viewerPermissions: {
        canCreateMessage: true,
        canPinMessages: true,
        canReact: true,
        canReply: true,
      },
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("viewer_membership");
    expect(sqlText).toContain("liked_messages");
    expect(sqlText).toContain("message_reactions.user_id =");
  });

  it("aggregates viewer likes and selected poll options before joining viewer state", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          liked_message_ids: ["message-1", "message-2"],
          selected_poll_option_ids: ["option-1", "option-2"],
          viewer_membership_role: "tribemate",
          viewer_membership_status: "active",
        },
      ],
    });
    const repository = new PostgresMessageRoundRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listViewerStateByTribeSlug({
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toMatchObject({
      likedMessageIds: ["message-1", "message-2"],
      selectedPollOptionIds: ["option-1", "option-2"],
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("liked_message_state as");
    expect(sqlText).toContain("selected_poll_option_state as");
    expect(sqlText).not.toContain("left join liked_messages");
    expect(sqlText).not.toContain("left join selected_poll_options");
    expect(sqlText).not.toContain("on true");
  });
});
