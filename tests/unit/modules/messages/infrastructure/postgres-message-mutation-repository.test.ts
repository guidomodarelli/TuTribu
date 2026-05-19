import { PostgresMessageMutationRepository } from "@/src/modules/messages/infrastructure/repositories/postgres-message-mutation-repository";
import { createKyselyRequestDatabase } from "@/src/modules/shared/infrastructure/database/kysely-request-database";

type QueryRowBatch =
  | Array<Record<string, unknown>>
  | ((statement: string) => Array<Record<string, unknown>>);

function createRequestKyselyDatabaseDouble(rowBatches: QueryRowBatch[]) {
  const query = jest.fn(async (statement: string) => {
    const rowBatch = rowBatches.shift() ?? [];
    const rows =
      typeof rowBatch === "function" ? rowBatch(String(statement)) : rowBatch;

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

function getExecutedSqlText(databaseDouble: { query: jest.Mock }): string {
  return databaseDouble.query.mock.calls
    .map(([statement]) => String(statement))
    .join("\n");
}

function getMessageInsertSqlText(databaseDouble: { query: jest.Mock }): string {
  return String(
    databaseDouble.query.mock.calls.find(([statement]) =>
      String(statement).startsWith('insert into "messages"'),
    )?.[0] ?? "",
  );
}

describe("PostgresMessageMutationRepository", () => {
  it("creates messages with a title and an active-member write guard", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [
        {
          access_scope: "tribemates",
          emoji: "🔥",
          id: "channel-ronda",
          name: "Ronda",
          slug: "ronda",
          sort_order: 20,
        },
      ],
      [
        {
          author_id: "member-1",
          channel_id: "channel-ronda",
          content: "Primera mensaje",
          created_at: "2026-04-26T12:00:00.000Z",
          id: "message-1",
          title: "Anuncio inicial",
          tribe_id: "tribe-1",
        },
      ],
      [
        {
          author_id: "member-1",
          author_image: null,
          author_name: "Grace Hopper",
          author_role: "tribemate",
          channel_access_scope: "tribemates",
          channel_emoji: "🔥",
          channel_id: "channel-ronda",
          channel_name: "Ronda",
          channel_slug: "ronda",
          channel_sort_order: 20,
          message_content: "Primera mensaje",
          message_created_at: "2026-04-26T12:00:00.000Z",
          message_id: "message-1",
          message_title: "Anuncio inicial",
          status: "created",
        },
      ],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.create({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Primera mensaje",
        title: "Anuncio inicial",
      }),
    ).resolves.toEqual({
      message: {
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
          id: "member-1",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        },
        replies: [],
        content: "Primera mensaje",
        createdAt: "2026-04-26T12:00:00.000Z",
        hasLoadedReplies: true,
        likedByViewer: false,
        isPinned: false,
        likeCount: 0,
        pinnedAt: null,
        poll: null,
        permissions: {
          canDelete: true,
        },
        title: "Anuncio inicial",
      },
      status: "created",
    });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain('insert into "messages"');
    expect(sqlText).toContain(
      '("author_id", "channel_id", "content", "created_at", "title", "tribe_id", "updated_at")',
    );
    expect(sqlText).toContain("public.is_active_tribe_member");
    expect(sqlText).toContain("returning");
    expect(sqlText).toContain('"message_authors"."name" as "author_name"');

    const insertSqlText = getMessageInsertSqlText(databaseDouble);

    expect(insertSqlText).toContain('from "tribe_channels"');
    expect(insertSqlText).toContain('"tribe_channels"."id" as "channel_id"');
  });

  it("returns forbidden when message insertion is blocked by the write guard", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [
        {
          access_scope: "tribemates",
          emoji: "🔥",
          id: "channel-ronda",
          name: "Ronda",
          slug: "ronda",
          sort_order: 20,
        },
      ],
      [],
      [{ id: "channel-ronda" }],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.create({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Primera mensaje",
        title: "Anuncio inicial",
      }),
    ).resolves.toEqual({ status: "forbidden" });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(databaseDouble.query).toHaveBeenCalledTimes(4);
    expect(sqlText).toContain('insert into "messages"');
    expect(sqlText).toContain("public.is_active_tribe_member");
  });

  it("returns invalid channel when the selected channel disappears before message insertion", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [
        {
          access_scope: "tribemates",
          emoji: "🔥",
          id: "channel-ronda",
          name: "Ronda",
          slug: "ronda",
          sort_order: 20,
        },
      ],
      [],
      [],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.create({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Primera mensaje",
        title: "Anuncio inicial",
      }),
    ).resolves.toEqual({ status: "invalid_channel" });

    const insertSqlText = getMessageInsertSqlText(databaseDouble);

    expect(insertSqlText).toContain('from "tribe_channels"');
    expect(insertSqlText).toContain('"tribe_channels"."id" as "channel_id"');
  });

  it("returns inserted poll options when creating a message with a poll", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ id: "tribe-1" }],
      [
        {
          access_scope: "tribemates",
          emoji: "🔥",
          id: "channel-ronda",
          name: "Ronda",
          slug: "ronda",
          sort_order: 20,
        },
      ],
      [
        {
          author_id: "member-1",
          channel_id: "channel-ronda",
          content: "Votemos el tema",
          created_at: "2026-04-26T12:00:00.000Z",
          id: "message-1",
          title: "Encuesta",
          tribe_id: "tribe-1",
        },
      ],
      [
        {
          author_id: "member-1",
          author_image: null,
          author_name: "Grace Hopper",
          author_role: "tribemate",
          channel_access_scope: "tribemates",
          channel_emoji: "🔥",
          channel_id: "channel-ronda",
          channel_name: "Ronda",
          channel_slug: "ronda",
          channel_sort_order: 20,
          message_content: "Votemos el tema",
          message_created_at: "2026-04-26T12:00:00.000Z",
          message_id: "message-1",
          message_title: "Encuesta",
          status: "created",
        },
      ],
      [
        {
          poll_allow_multiple_votes: false,
          poll_id: "poll-1",
          poll_question: "¿Qué practicamos?",
        },
      ],
      [
        { id: "option-1", sort_order: 1, text: "Álgebra" },
        { id: "option-2", sort_order: 2, text: "Geometría" },
      ],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.create({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Votemos el tema",
        poll: {
          allowMultipleVotes: false,
          options: ["Álgebra", "Geometría"],
          question: "¿Qué practicamos?",
        },
        title: "Encuesta",
      }),
    ).resolves.toMatchObject({
      message: {
        poll: {
          id: "poll-1",
          options: [
            {
              id: "option-1",
              percentage: 0,
              selectedByViewer: false,
              text: "Álgebra",
              voteCount: 0,
            },
            {
              id: "option-2",
              percentage: 0,
              selectedByViewer: false,
              text: "Geometría",
              voteCount: 0,
            },
          ],
          totalVoteCount: 0,
          viewerHasVoted: false,
        },
      },
      status: "created",
    });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(databaseDouble.query).toHaveBeenCalledTimes(6);
    expect(sqlText).toContain('insert into "messages"');
    expect(sqlText).toContain('insert into "message_polls"');
    expect(sqlText).toContain('insert into "message_poll_options"');
    expect(sqlText).not.toContain("json_agg");
    expect(sqlText).not.toContain("unnest");
  });

  it("toggles likes with an active-member write guard and idempotent upsert", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ messageId: "message-1", tribeId: "tribe-1" }],
      [{ canWrite: true }],
      [],
      [{ id: "reaction-1" }],
      [{ like_count: "3" }],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.toggle({
        tribeSlug: "matematica-pro",
        messageId: "message-1",
        userId: "member-1",
      }),
    ).resolves.toEqual({
      likedByViewer: true,
      likeCount: 3,
      status: "liked",
    });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain("public.is_active_tribe_member");
    expect(sqlText).toContain('delete from "message_reactions"');
    expect(sqlText).toContain('insert into "message_reactions"');
    expect(sqlText).toContain(
      'on conflict ("message_id", "user_id") do nothing',
    );
    expect(sqlText).toContain("count(");
  });

  it("pins messages through a limit-guarded transaction", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ messageId: "message-1", tribeId: "tribe-1" }],
      [{ canPin: true }],
      [],
      [{ lock_key: "1" }],
      [],
      [{ pinned_count: "2" }],
      [{ pinned_at: "2026-04-26T13:00:00.000Z" }],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.togglePin({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "leader-1",
      }),
    ).resolves.toEqual({
      isPinned: true,
      pinnedAt: "2026-04-26T13:00:00.000Z",
      status: "pinned",
    });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain("public.can_pin_tribe_messages");
    expect(sqlText).toContain("pg_advisory_xact_lock");
    expect(sqlText).toContain('select "pinned_at" from "message_pins"');
    expect(sqlText).toContain("count(");
    expect(sqlText).toContain('insert into "message_pins"');
  });

  it("blocks pinning when the tribe pin limit is reached", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ messageId: "message-4", tribeId: "tribe-1" }],
      [{ canPin: true }],
      [],
      [{ lock_key: "1" }],
      [],
      [{ pinned_count: "3" }],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.togglePin({
        messageId: "message-4",
        tribeSlug: "matematica-pro",
        userId: "leader-1",
      }),
    ).resolves.toEqual({
      isPinned: false,
      pinnedAt: null,
      status: "pin_limit_reached",
    });
    expect(databaseDouble.query).toHaveBeenCalledTimes(6);
  });

  it("returns the concurrent pin state when another request pinned the same message after locking", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ messageId: "message-1", tribeId: "tribe-1" }],
      [{ canPin: true }],
      [],
      [{ lock_key: "1" }],
      [{ pinned_at: "2026-04-26T13:00:00.000Z" }],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.togglePin({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "leader-2",
      }),
    ).resolves.toEqual({
      isPinned: true,
      pinnedAt: "2026-04-26T13:00:00.000Z",
      status: "pinned",
    });

    expect(getExecutedSqlText(databaseDouble)).toContain(
      'where "message_id" = $1',
    );
    expect(databaseDouble.query).toHaveBeenCalledTimes(5);
  });

  it("unpins an already pinned message", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ messageId: "message-1", tribeId: "tribe-1" }],
      [{ canPin: true }],
      [{ message_id: "message-1" }],
      [{ id: "message-1" }],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.togglePin({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "guardian-1",
      }),
    ).resolves.toEqual({
      isPinned: false,
      pinnedAt: null,
      status: "unpinned",
    });
    expect(getExecutedSqlText(databaseDouble)).toContain(
      'delete from "message_pins"',
    );
  });

  it("serializes single-choice poll votes and returns compact poll results", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [
        {
          allow_multiple_votes: false,
          can_write: true,
          poll_id: "poll-1",
          tribe_id: "tribe-1",
        },
      ],
      [{ option_id: "option-2" }],
      [{ lock_key: "1" }],
      [],
      [{ id: "vote-1" }],
      [
        {
          allow_multiple_votes: false,
          option_id: "option-1",
          option_text: "Álgebra",
          poll_id: "poll-1",
          question: "¿Qué practicamos?",
          selected_by_viewer: "0",
          total_vote_count: "1",
          vote_count: "0",
        },
        {
          allow_multiple_votes: false,
          option_id: "option-2",
          option_text: "Geometría",
          poll_id: "poll-1",
          question: "¿Qué practicamos?",
          selected_by_viewer: "1",
          total_vote_count: "1",
          vote_count: "1",
        },
      ],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.vote({
        messageId: "message-1",
        optionIds: ["option-2"],
        tribeSlug: "matematica-pro",
        userId: "member-1",
      }),
    ).resolves.toMatchObject({
      poll: {
        totalVoteCount: 1,
        viewerHasVoted: true,
      },
      status: "voted",
    });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain("public.is_active_tribe_member");
    expect(sqlText).toContain('"id" in');
    expect(sqlText).toContain("pg_advisory_xact_lock");
    expect(sqlText).toContain("hashtext");
    expect(sqlText).toContain('delete from "message_poll_votes"');
    expect(sqlText).toContain('insert into "message_poll_votes"');
    expect(sqlText).toContain(
      'on conflict ("poll_id", "option_id", "user_id") do nothing',
    );
  });

  it("returns forbidden before validating options when the viewer cannot write poll votes", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [
        {
          allow_multiple_votes: false,
          can_write: false,
          poll_id: "poll-1",
          tribe_id: "tribe-1",
        },
      ],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.vote({
        messageId: "message-1",
        optionIds: ["option-2"],
        tribeSlug: "matematica-pro",
        userId: "muted-member-1",
      }),
    ).resolves.toEqual({
      status: "forbidden",
    });

    expect(databaseDouble.query).toHaveBeenCalledTimes(1);
    expect(getExecutedSqlText(databaseDouble)).toContain(
      'public.is_active_tribe_member("message_polls"."tribe_id")',
    );
  });

  it("deletes a full message through author or staff permissions", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [
        {
          authorId: "author-1",
          canManage: false,
          canWrite: true,
          messageId: "message-1",
          tribeId: "tribe-1",
        },
      ],
      [{ id: "message-1" }],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.delete({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "author-1",
      }),
    ).resolves.toEqual({ status: "deleted" });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain('delete from "messages"');
    expect(sqlText).toContain('"messages"."author_id"');
    expect(sqlText).toContain(
      'public.is_active_tribe_member("messages"."tribe_id")',
    );
    expect(sqlText).toContain(
      'public.can_pin_tribe_messages("messages"."tribe_id")',
    );
    expect(sqlText).not.toContain("message_polls");
  });

  it("maps missing and unauthorized message deletion outcomes", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [],
      [
        {
          authorId: "author-1",
          canManage: false,
          canWrite: false,
          messageId: "message-1",
          tribeId: "tribe-1",
        },
      ],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.delete({
        messageId: "missing-message",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      }),
    ).resolves.toEqual({ status: "not_found" });
    await expect(
      repository.delete({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "member-2",
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("maps a message deleted by another request before deletion as not found", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [
        {
          authorId: "member-1",
          canManage: false,
          canWrite: true,
          messageId: "message-1",
          tribeId: "tribe-1",
        },
      ],
      [],
      [],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.delete({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      }),
    ).resolves.toEqual({ status: "not_found" });

    expect(databaseDouble.query).toHaveBeenCalledTimes(3);
  });

  it("serializes multiple-choice poll votes before replacing the viewer selections", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [
        {
          allow_multiple_votes: true,
          can_write: true,
          poll_id: "poll-1",
          tribe_id: "tribe-1",
        },
      ],
      [{ option_id: "option-1" }, { option_id: "option-2" }],
      [{ lock_key: "1" }],
      [],
      [{ id: "vote-1" }],
      [{ id: "vote-2" }],
      [
        {
          allow_multiple_votes: true,
          option_id: "option-1",
          option_text: "Álgebra",
          poll_id: "poll-1",
          question: "¿Qué practicamos?",
          selected_by_viewer: "1",
          total_vote_count: "2",
          vote_count: "1",
        },
        {
          allow_multiple_votes: true,
          option_id: "option-2",
          option_text: "Geometría",
          poll_id: "poll-1",
          question: "¿Qué practicamos?",
          selected_by_viewer: "1",
          total_vote_count: "2",
          vote_count: "1",
        },
      ],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.vote({
        messageId: "message-1",
        optionIds: ["option-1", "option-2"],
        tribeSlug: "matematica-pro",
        userId: "member-1",
      }),
    ).resolves.toMatchObject({
      status: "voted",
    });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain("pg_advisory_xact_lock");
    expect(sqlText).toContain('"id" in');
    expect(sqlText).toContain('delete from "message_poll_votes"');
    expect(sqlText.match(/insert into "message_poll_votes"/g)).toHaveLength(2);
  });

  it("creates replies with the returned reply view model", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ messageId: "message-1", tribeId: "tribe-1" }],
      [{ canWrite: true }],
      [
        {
          author_id: "member-1",
          content: "Excelente clase",
          created_at: "2026-04-26T12:05:00.000Z",
          id: "reply-1",
          status: "created",
          tribe_id: "tribe-1",
        },
      ],
      [
        {
          reply_author_id: "member-1",
          reply_author_image: null,
          reply_author_name: "Grace Hopper",
          reply_author_role: "tribemate",
          reply_content: "Excelente clase",
          reply_created_at: "2026-04-26T12:05:00.000Z",
          reply_id: "reply-1",
          status: "created",
        },
      ],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.create({
        authorId: "member-1",
        tribeSlug: "matematica-pro",
        content: "Excelente clase",
        messageId: "message-1",
      }),
    ).resolves.toEqual({
      reply: {
        id: "reply-1",
        author: {
          id: "member-1",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        },
        content: "Excelente clase",
        createdAt: "2026-04-26T12:05:00.000Z",
      },
      status: "created",
    });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(sqlText).toContain('insert into "message_replies"');
    expect(sqlText).toContain(
      '("author_id", "content", "created_at", "message_id", "tribe_id")',
    );
    expect(sqlText).toContain('with "target_message" as');
    expect(sqlText).toContain("public.is_active_tribe_member");
    expect(sqlText).toContain('"reply_authors"."name" as "reply_author_name"');
  });

  it("returns forbidden when reply insertion is blocked by the write guard", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ messageId: "message-1", tribeId: "tribe-1" }],
      [{ canWrite: true }],
      [],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.create({
        authorId: "member-1",
        tribeSlug: "matematica-pro",
        content: "Excelente clase",
        messageId: "message-1",
      }),
    ).resolves.toEqual({ status: "forbidden" });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(databaseDouble.query).toHaveBeenCalledTimes(3);
    expect(sqlText).toContain('insert into "message_replies"');
    expect(sqlText).toContain('with "target_message" as');
    expect(sqlText).toContain("public.is_active_tribe_member");
  });

  it("returns not found when the reply target is deleted before insertion", async () => {
    const databaseDouble = createRequestKyselyDatabaseDouble([
      [{ messageId: "message-1", tribeId: "tribe-1" }],
      [{ canWrite: true }],
      [{ status: "not_found" }],
    ]);
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback(databaseDouble.database as never),
    );

    await expect(
      repository.create({
        authorId: "member-1",
        tribeSlug: "matematica-pro",
        content: "Excelente clase",
        messageId: "message-1",
      }),
    ).resolves.toEqual({ status: "not_found" });

    const sqlText = getExecutedSqlText(databaseDouble);

    expect(databaseDouble.query).toHaveBeenCalledTimes(3);
    expect(sqlText).toContain('with "target_message" as');
    expect(sqlText).toContain("when not exists (select 1 from target_message)");
  });
});
