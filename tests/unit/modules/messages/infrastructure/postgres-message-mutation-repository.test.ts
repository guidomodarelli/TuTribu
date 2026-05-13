import { PostgresMessageMutationRepository } from "@/src/modules/messages/infrastructure/repositories/postgres-message-mutation-repository";

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

function getSqlQuery(statement: unknown): { params: unknown[]; sql: string } {
  return (
    statement as {
      toQuery: (config: {
        casing: { getColumnCasing: (column: { name: string }) => string };
        escapeName: (name: string) => string;
        escapeParam: (index: number) => string;
        escapeString: (value: string) => string;
      }) => { params: unknown[]; sql: string };
    }
  ).toQuery({
    casing: { getColumnCasing: (column) => column.name },
    escapeName: (name) => `"${name}"`,
    escapeParam: (index) => `$${index + 1}`,
    escapeString: (value) => `'${value.replaceAll("'", "''")}'`,
  });
}

describe("PostgresMessageMutationRepository", () => {
  it("creates messages with a title and an active-member write guard", async () => {
    const execute = jest.fn(async () => ({
      rows: [
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
    }));
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.create({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Primera mensaje",
        title: "Anuncio inicial",
      })
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

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("insert into public.messages");
    expect(sqlText).toContain(
      "(tribe_id, channel_id, author_id, title, content, created_at, updated_at)"
    );
    expect(sqlText).toContain("target_channel");
    expect(sqlText).toContain(
      "where public.is_active_tribe_member(target_tribe.id)"
    );
    expect(sqlText).toContain("returning");
    expect(sqlText).toContain("message_authors.name as author_name");
  });

  it("returns inserted poll options when creating a message with a poll", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
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
      })
      .mockResolvedValueOnce({
        rows: [
          {
            poll_allow_multiple_votes: false,
            poll_id: "poll-1",
            poll_question: "¿Qué practicamos?",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            poll_options: [
              { id: "option-1", text: "Álgebra" },
              { id: "option-2", text: "Geometría" },
            ],
          },
        ],
      });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
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
      })
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

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(execute).toHaveBeenCalledTimes(3);
    expect(sqlText).toContain("insert into public.messages");
    expect(sqlText).not.toContain("insert into public.message_polls");
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain(
      "insert into public.message_polls"
    );
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
      "insert into public.message_poll_options"
    );
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
      "poll_option.sort_order::integer"
    );
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain("json_agg");
    expect(getSqlQuery(execute.mock.calls[2]?.[0])).toMatchObject({
      params: [["Álgebra", "Geometría"], "poll-1"],
      sql: expect.stringContaining("unnest($1::text[])"),
    });
  });

  it("toggles likes with an active-member write guard and idempotent upsert", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_write: true,
            tribe_id: "tribe-1",
            message_id: "message-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "reaction-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            like_count: "3",
          },
        ],
      });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.toggle({
        tribeSlug: "matematica-pro",
        messageId: "message-1",
        userId: "member-1",
      })
    ).resolves.toEqual({
      likedByViewer: true,
      likeCount: 3,
      status: "liked",
    });

    const targetMessageSqlText = getSqlText(execute.mock.calls[0]?.[0]);
    const deleteSqlText = getSqlText(execute.mock.calls[1]?.[0]);
    const insertSqlText = getSqlText(execute.mock.calls[2]?.[0]);
    const countSqlText = getSqlText(execute.mock.calls[3]?.[0]);

    expect(targetMessageSqlText).toContain(
      "public.is_active_tribe_member(messages.tribe_id) as can_write"
    );
    expect(deleteSqlText).toContain("delete from public.message_reactions");
    expect(insertSqlText).toContain(
      "(message_id, tribe_id, user_id, type, created_at)"
    );
    expect(insertSqlText).toContain("on conflict (message_id, user_id) do nothing");
    expect(countSqlText).toContain("count(*) as like_count");
  });

  it("pins messages through a limit-guarded transaction", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_pin: true,
            is_pinned: false,
            message_id: "message-1",
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ lock_key: "1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ pinned_count: "2" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            pinned_at: "2026-04-26T13:00:00.000Z",
          },
        ],
      });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.togglePin({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "leader-1",
      })
    ).resolves.toEqual({
      isPinned: true,
      pinnedAt: "2026-04-26T13:00:00.000Z",
      status: "pinned",
    });

    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "public.can_pin_tribe_messages(messages.tribe_id) as can_pin"
    );
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain("pg_advisory_xact_lock");
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain("select message_pins.pinned_at");
    expect(getSqlText(execute.mock.calls[3]?.[0])).toContain("count(*) as pinned_count");
    expect(getSqlText(execute.mock.calls[4]?.[0])).toContain("insert into public.message_pins");
  });

  it("blocks pinning when the tribe pin limit is reached", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_pin: true,
            is_pinned: false,
            message_id: "message-4",
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ lock_key: "1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ pinned_count: "3" }] });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.togglePin({
        messageId: "message-4",
        tribeSlug: "matematica-pro",
        userId: "leader-1",
      })
    ).resolves.toEqual({
      isPinned: false,
      pinnedAt: null,
      status: "pin_limit_reached",
    });
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it("returns the concurrent pin state when another request pinned the same message after locking", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_pin: true,
            is_pinned: false,
            message_id: "message-1",
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ lock_key: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            pinned_at: "2026-04-26T13:00:00.000Z",
          },
        ],
      });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.togglePin({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "leader-2",
      })
    ).resolves.toEqual({
      isPinned: true,
      pinnedAt: "2026-04-26T13:00:00.000Z",
      status: "pinned",
    });

    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
      "where message_pins.message_id ="
    );
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("unpins an already pinned message", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_pin: true,
            is_pinned: true,
            message_id: "message-1",
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "message-1" }] });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.togglePin({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "guardian-1",
      })
    ).resolves.toEqual({
      isPinned: false,
      pinnedAt: null,
      status: "unpinned",
    });
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain(
      "delete from public.message_pins"
    );
  });

  it("serializes single-choice poll votes and returns compact poll results", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            allow_multiple_votes: false,
            can_write: true,
            poll_id: "poll-1",
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ option_id: "option-2" }] })
      .mockResolvedValueOnce({ rows: [{ lock_key: "1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "vote-1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            allow_multiple_votes: false,
            option_id: "option-1",
            option_text: "Álgebra",
            poll_id: "poll-1",
            question: "¿Qué practicamos?",
            selected_by_viewer: false,
            total_vote_count: "1",
            vote_count: "0",
          },
          {
            allow_multiple_votes: false,
            option_id: "option-2",
            option_text: "Geometría",
            poll_id: "poll-1",
            question: "¿Qué practicamos?",
            selected_by_viewer: true,
            total_vote_count: "1",
            vote_count: "1",
          },
        ],
      });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.vote({
        messageId: "message-1",
        optionIds: ["option-2"],
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toMatchObject({
      poll: {
        totalVoteCount: 1,
        viewerHasVoted: true,
      },
      status: "voted",
    });

    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
      "pg_advisory_xact_lock"
    );
    expect(getSqlText(execute.mock.calls[3]?.[0])).toContain(
      "delete from public.message_poll_votes"
    );
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
      "hashtext"
    );
  });

  it("returns forbidden before validating options when the viewer cannot write poll votes", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          allow_multiple_votes: false,
          can_write: false,
          poll_id: "poll-1",
          tribe_id: "tribe-1",
        },
      ],
    });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.vote({
        messageId: "message-1",
        optionIds: ["option-2"],
        tribeSlug: "matematica-pro",
        userId: "muted-member-1",
      })
    ).resolves.toEqual({
      status: "forbidden",
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(getSqlText(execute.mock.calls[0]?.[0])).toContain(
      "public.is_active_tribe_member(message_polls.tribe_id) as can_write"
    );
  });

  it("deletes a full message through author or staff permissions", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [{ status: "deleted" }],
    });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.delete({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "author-1",
      })
    ).resolves.toEqual({ status: "deleted" });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("delete from public.messages");
    expect(sqlText).toContain("messages.author_id =");
    expect(sqlText).toContain("public.is_active_tribe_member(messages.tribe_id)");
    expect(sqlText).toContain("public.can_pin_tribe_messages(messages.tribe_id)");
    expect(sqlText).not.toContain("delete from public.message_polls");
  });

  it("maps missing and unauthorized message deletion outcomes", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ status: "not_found" }] })
      .mockResolvedValueOnce({ rows: [{ status: "forbidden" }] });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.delete({
        messageId: "missing-message",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({ status: "not_found" });
    await expect(
      repository.delete({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "member-2",
      })
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("serializes multiple-choice poll votes before replacing the viewer selections", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            allow_multiple_votes: true,
            can_write: true,
            poll_id: "poll-1",
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ option_id: "option-1" }, { option_id: "option-2" }],
      })
      .mockResolvedValueOnce({ rows: [{ lock_key: "1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "vote-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "vote-2" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            allow_multiple_votes: true,
            option_id: "option-1",
            option_text: "Álgebra",
            poll_id: "poll-1",
            question: "¿Qué practicamos?",
            selected_by_viewer: true,
            total_vote_count: "2",
            vote_count: "1",
          },
          {
            allow_multiple_votes: true,
            option_id: "option-2",
            option_text: "Geometría",
            poll_id: "poll-1",
            question: "¿Qué practicamos?",
            selected_by_viewer: true,
            total_vote_count: "2",
            vote_count: "1",
          },
        ],
      });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.vote({
        messageId: "message-1",
        optionIds: ["option-1", "option-2"],
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toMatchObject({
      status: "voted",
    });

    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
      "pg_advisory_xact_lock"
    );
    expect(getSqlText(execute.mock.calls[3]?.[0])).toContain(
      "delete from public.message_poll_votes"
    );
    expect(getSqlText(execute.mock.calls[4]?.[0])).toContain(
      "insert into public.message_poll_votes"
    );
  });

  it("creates replies with the returned reply view model", async () => {
    const execute = jest.fn(async () => ({
      rows: [
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
    }));
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.create({
        authorId: "member-1",
        tribeSlug: "matematica-pro",
        content: "Excelente clase",
        messageId: "message-1",
      })
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

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("insert into public.message_replies");
    expect(sqlText).toContain("(message_id, tribe_id, author_id, content, created_at)");
    expect(sqlText).toContain("reply_authors.name as reply_author_name");
  });
});
