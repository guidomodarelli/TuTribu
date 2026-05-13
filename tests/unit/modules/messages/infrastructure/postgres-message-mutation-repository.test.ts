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
        likedByViewer: false,
        isPinned: false,
        likeCount: 0,
        pinnedAt: null,
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
