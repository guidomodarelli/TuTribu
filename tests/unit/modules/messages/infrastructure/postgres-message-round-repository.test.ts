import { createKyselyRequestDatabase } from "@/src/modules/shared/infrastructure/database/kysely-request-database";
import { PostgresMessageRoundRepository } from "@/src/modules/messages/infrastructure/repositories/postgres-message-round-repository";

function createRequestKyselyDatabaseDouble(
  rowBatches: Array<Array<Record<string, unknown>>>
) {
  const query = jest.fn(async () => {
    const rows = rowBatches.shift() ?? [];

    return {
      rowCount: rows.length,
      rows,
    };
  });

  return {
    database: {
      kysely: createKyselyRequestDatabase({
        query,
      } as never),
    },
    query,
  };
}

function getExecutedSqlText(databaseDouble: {
  query: jest.Mock;
}): string {
  return databaseDouble.query.mock.calls
    .map(([statement]) => String(statement))
    .join("\n");
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

  const messageRow = {
    author_id: "leader-1",
    author_image: null,
    author_name: "Ada Lovelace",
    author_role: "leader",
    channel_access_scope: "tribemates",
    channel_emoji: "🔥",
    channel_id: "channel-ronda",
    channel_name: "Ronda",
    channel_slug: "ronda",
    channel_sort_order: 20,
    like_count: "2",
    message_content: "Bienvenida",
    message_created_at: "2026-04-26T12:00:00.000Z",
    message_id: "message-1",
    message_pinned_at: "2026-04-26T13:00:00.000Z",
    message_title: "Anuncio inicial",
  };

  it("maps paginated round rows into messages without loading replies", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      channelRows,
      [messageRow],
      [],
      [{ id: "tribe-1" }],
      [{ role: "leader", status: "active" }],
      [{ message_id: "message-1" }],
      [],
    ]);
    const repository = new PostgresMessageRoundRepository(async (callback) =>
      callback(databaseDouble.database as never)
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

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain('order by case when "message_pins"."pinned_at" is null');
    expect(sqlText).not.toContain("message_replies");
  });

  it("returns viewer permissions when the tribe has no messages yet", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      channelRows,
      [],
      [{ id: "tribe-1" }],
      [{ role: "tribemate", status: "active" }],
      [],
      [],
    ]);
    const repository = new PostgresMessageRoundRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toMatchObject({
      messages: [],
      viewerPermissions: {
        canReply: true,
        canCreateMessage: true,
        canReact: true,
        canPinMessages: false,
      },
    });
  });

  it("blocks own message deletion for muted viewers", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      channelRows,
      [{
        ...messageRow,
        author_id: "member-1",
        author_name: "Grace Hopper",
        author_role: "tribemate",
        like_count: "0",
        message_pinned_at: null,
        message_title: "Read-only",
      }],
      [],
      [{ id: "tribe-1" }],
      [{ role: "tribemate", status: "muted" }],
      [],
      [],
    ]);
    const repository = new PostgresMessageRoundRepository(async (callback) =>
      callback(databaseDouble.database as never)
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

  it("returns shared round data without viewer-specific reaction state", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      channelRows,
      [messageRow],
      [],
    ]);
    const repository = new PostgresMessageRoundRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.listSharedDataByTribeSlug({
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toMatchObject({
      activeChannelId: null,
      messages: [
        expect.not.objectContaining({
          likedByViewer: expect.any(Boolean),
        }),
      ],
    });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).not.toContain("viewer_membership_status");
    expect(sqlText).not.toContain("message_replies");
  });

  it("filters shared round data by channel and detects the next page", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      channelRows,
      Array.from({ length: 16 }, (_, index) => ({
        ...messageRow,
        message_id: `message-${index + 1}`,
        message_pinned_at: null,
      })),
      [],
    ]);
    const repository = new PostgresMessageRoundRepository(async (callback) =>
      callback(databaseDouble.database as never)
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

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain('"messages"."channel_id" = $');
    expect(sqlText).toContain("limit");
    expect(sqlText).toContain("offset");
  });

  it("lists message replies separately from the shared round", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ id: "message-1", tribe_id: "tribe-1" }],
      [{ role: "tribemate", status: "active" }],
      [
        {
          reply_author_id: "member-1",
          reply_author_image: null,
          reply_author_name: "Grace Hopper",
          reply_author_role: "tribemate",
          reply_content: "Gracias",
          reply_created_at: "2026-04-26T12:05:00.000Z",
          reply_id: "reply-1",
        },
      ],
    ]);
    const repository = new PostgresMessageRoundRepository(async (callback) =>
      callback(databaseDouble.database as never)
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

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain("message_replies");
    expect(sqlText).toContain('order by "message_replies"."created_at" asc');
  });

  it("returns viewer state separately from shared message rows", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [{ role: "guardian", status: "active" }],
      [{ message_id: "message-1" }, { message_id: "message-2" }],
      [{ option_id: "option-1" }, { option_id: "option-2" }],
    ]);
    const repository = new PostgresMessageRoundRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.listViewerStateByTribeSlug({
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toEqual({
      likedMessageIds: ["message-1", "message-2"],
      selectedPollOptionIds: ["option-1", "option-2"],
      viewerId: "member-1",
      viewerPermissions: {
        canCreateMessage: true,
        canPinMessages: true,
        canReact: true,
        canReply: true,
      },
    });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain("message_reactions");
    expect(sqlText).toContain("message_poll_votes");
  });

  it("keeps read-only viewers without visible membership from loading interaction state", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [],
      [{ message_id: "message-1" }],
      [{ option_id: "option-1" }],
    ]);
    const repository = new PostgresMessageRoundRepository(async (callback) =>
      callback(databaseDouble.database as never)
    );

    await expect(
      repository.listViewerStateByTribeSlug({
        tribeSlug: "matematica-pro",
        viewerId: "owner-1",
      })
    ).resolves.toEqual({
      likedMessageIds: [],
      selectedPollOptionIds: [],
      viewerId: "owner-1",
      viewerPermissions: {
        canCreateMessage: false,
        canPinMessages: false,
        canReact: false,
        canReply: false,
      },
    });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).not.toContain("message_reactions");
    expect(sqlText).not.toContain("message_poll_votes");
  });
});
