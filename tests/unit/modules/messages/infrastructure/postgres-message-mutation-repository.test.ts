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
        images: [],
        likedByViewer: false,
        isPinned: false,
        likeCount: 0,
        pinnedAt: null,
        poll: null,
        replyAuthorsPreview: [],
        replyCount: 0,
        permissions: {
          canDelete: true,
          canEdit: true,
        },
        title: "Anuncio inicial",
        video: null,
      },
      status: "created",
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("insert into public.messages");
    expect(sqlText).toContain(
      "(tribe_id, channel_id, author_id, title, content, external_video_provider, external_video_id, created_at, updated_at)"
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

  it("creates messages with parsed external video columns", async () => {
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
          message_content: "Miren este video",
          message_created_at: "2026-04-26T12:00:00.000Z",
          message_external_video_id: "dQw4w9WgXcQ",
          message_external_video_provider: "youtube",
          message_id: "message-1",
          message_title: "Recurso",
          status: "created",
        },
      ],
    }));
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.create({
      authorId: "member-1",
      channelId: "channel-ronda",
      tribeSlug: "matematica-pro",
      content: "Miren este video",
      title: "Recurso",
      video: { externalId: "dQw4w9WgXcQ", provider: "youtube" },
    });

    expect(result).toMatchObject({
      message: {
        video: { externalId: "dQw4w9WgXcQ", provider: "youtube" },
      },
      status: "created",
    });

    const insertQuery = getSqlQuery(execute.mock.calls[0]?.[0]);

    expect(insertQuery.sql).toContain(
      "(tribe_id, channel_id, author_id, title, content, external_video_provider, external_video_id, created_at, updated_at)"
    );
    expect(insertQuery.params).toEqual(
      expect.arrayContaining(["youtube", "dQw4w9WgXcQ"])
    );
  });

  it("attaches prepared images when creating a message", async () => {
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
            message_content: "Miren estas capturas",
            message_created_at: "2026-04-26T12:00:00.000Z",
            message_id: "message-1",
            message_title: "Capturas",
            message_tribe_id: "tribe-1",
            status: "created",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            message_images: [
              {
                alt_text: "",
                id: "asset-1",
                url: "https://imagedelivery.net/account-hash/image-1/public",
              },
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
        content: "Miren estas capturas",
        images: [{ altText: "", assetId: "asset-1", sortOrder: 0 }],
        title: "Capturas",
      })
    ).resolves.toMatchObject({
      message: {
        images: [
          {
            altText: "",
            id: "asset-1",
            url: "https://imagedelivery.net/account-hash/image-1/public",
          },
        ],
      },
      status: "created",
    });

    expect(execute).toHaveBeenCalledTimes(3);
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain(
      "update public.message_images"
    );
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain("pending_delete");
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
      "message_images.status ="
    );
    expect(getSqlQuery(execute.mock.calls[2]?.[0])).toMatchObject({
      params: expect.arrayContaining([["asset-1"], [""]]),
      sql: expect.stringContaining("unnest"),
    });
  });

  it("aborts message creation when prepared images cannot all be attached", async () => {
    let transactionWasAborted = false;
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
            message_content: "Miren estas capturas",
            message_created_at: "2026-04-26T12:00:00.000Z",
            message_id: "message-1",
            message_title: "Capturas",
            message_tribe_id: "tribe-1",
            status: "created",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ message_images: [] }] });
    const repository = new PostgresMessageMutationRepository(async (callback) => {
      try {
        return await callback({ execute } as never);
      } catch (error) {
        transactionWasAborted = true;
        throw error;
      }
    });

    await expect(
      repository.create({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Miren estas capturas",
        images: [{ altText: "", assetId: "asset-1", sortOrder: 0 }],
        title: "Capturas",
      })
    ).resolves.toEqual({
      status: "invalid_image",
    });

    expect(transactionWasAborted).toBe(true);
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

  it("returns like failures without message state fields", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            can_write: false,
            message_id: "message-1",
            tribe_id: "tribe-1",
          },
        ],
      });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.toggle({
        tribeSlug: "matematica-pro",
        messageId: "missing-message",
        userId: "member-1",
      })
    ).resolves.toEqual({
      status: "not_found",
    });
    await expect(
      repository.toggle({
        tribeSlug: "matematica-pro",
        messageId: "message-1",
        userId: "member-1",
      })
    ).resolves.toEqual({
      status: "forbidden",
    });
    expect(execute).toHaveBeenCalledTimes(2);
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

  it("returns pin failures without message state fields", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            can_pin: false,
            is_pinned: false,
            message_id: "message-1",
            tribe_id: "tribe-1",
          },
        ],
      });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.togglePin({
        messageId: "missing-message",
        tribeSlug: "matematica-pro",
        userId: "leader-1",
      })
    ).resolves.toEqual({
      status: "not_found",
    });
    await expect(
      repository.togglePin({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "leader-1",
      })
    ).resolves.toEqual({
      status: "forbidden",
    });
    expect(execute).toHaveBeenCalledTimes(2);
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
      .mockResolvedValueOnce({ rows: [{ lock_key: "1" }] })
      .mockResolvedValueOnce({ rows: [{ lock_key: "1" }] })
      .mockResolvedValueOnce({ rows: [{ option_id: "option-2" }] })
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

    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain(
      "pg_advisory_xact_lock_shared"
    );
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
      "pg_advisory_xact_lock"
    );
    expect(getSqlQuery(execute.mock.calls[3]?.[0])).toMatchObject({
      params: ["poll-1", "option-2"],
      sql: expect.stringContaining("any(array[$2::uuid]::uuid[])"),
    });
    expect(getSqlText(execute.mock.calls[4]?.[0])).toContain(
      "delete from public.message_poll_votes"
    );
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain(
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
      .mockResolvedValueOnce({ rows: [{ lock_key: "1" }] })
      .mockResolvedValueOnce({ rows: [{ lock_key: "1" }] })
      .mockResolvedValueOnce({
        rows: [{ option_id: "option-1" }, { option_id: "option-2" }],
      })
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

    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain(
      "pg_advisory_xact_lock_shared"
    );
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
      "pg_advisory_xact_lock"
    );
    expect(getSqlQuery(execute.mock.calls[3]?.[0])).toMatchObject({
      params: ["poll-1", "option-1", "option-2"],
      sql: expect.stringContaining("any(array[$2::uuid, $3::uuid]::uuid[])"),
    });
    expect(getSqlText(execute.mock.calls[4]?.[0])).toContain(
      "delete from public.message_poll_votes"
    );
    expect(getSqlText(execute.mock.calls[5]?.[0])).toContain(
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

  it("updates the message created_at through the leader-guarded statement", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          message_created_at: "2026-04-01T10:00:00.000Z",
          status: "updated",
        },
      ],
    }));
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.updateCreatedAt({
        createdAt: "2026-04-01T10:00:00.000Z",
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "leader-1",
      })
    ).resolves.toEqual({
      createdAt: "2026-04-01T10:00:00.000Z",
      status: "updated",
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("public.is_tribe_leader(messages.tribe_id) as can_edit");
    expect(sqlText).toContain("update public.messages");
    expect(sqlText).toContain("set created_at =");
    expect(sqlText).toContain("updated_at = timezone('utc', now())");
  });

  it("returns not_found when the message does not exist", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          message_created_at: null,
          status: "not_found",
        },
      ],
    }));
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.updateCreatedAt({
        createdAt: "2026-04-01T10:00:00.000Z",
        messageId: "missing-message",
        tribeSlug: "matematica-pro",
        userId: "leader-1",
      })
    ).resolves.toEqual({ status: "not_found" });
  });

  it("returns forbidden when the viewer cannot edit the message created_at", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          message_created_at: null,
          status: "forbidden",
        },
      ],
    }));
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.updateCreatedAt({
        createdAt: "2026-04-01T10:00:00.000Z",
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "tribemate-1",
      })
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("updates the message title and content through the author-guarded statement", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_edit: true,
            external_video_id: null,
            external_video_provider: null,
            message_id: "message-1",
            poll_allow_multiple_votes: null,
            poll_id: null,
            poll_question: null,
            poll_vote_count: 0,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ message_id: "message-1" }] });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.updateContent({
        content: "Mensaje editado",
        messageId: "message-1",
        title: "Titulo editado",
        tribeSlug: "matematica-pro",
        userId: "author-1",
      })
    ).resolves.toEqual({
      content: "Mensaje editado",
      messageId: "message-1",
      status: "updated",
      title: "Titulo editado",
    });

    expect(execute).toHaveBeenCalledTimes(2);

    const selectSql = getSqlText(execute.mock.calls[0]?.[0]);
    const updateSql = getSqlText(execute.mock.calls[1]?.[0]);

    expect(selectSql).toContain("messages.author_id =");
    expect(selectSql).toContain("public.is_active_tribe_member(messages.tribe_id)");
    expect(selectSql).toContain("from public.message_poll_votes");
    expect(updateSql).toContain("update public.messages");
    expect(updateSql).toContain("set title =");
    expect(updateSql).toContain("content =");
    expect(updateSql).toContain("external_video_provider =");
    expect(updateSql).toContain("updated_at = timezone('utc', now())");
    expect(updateSql).toContain("returning messages.id as message_id");
  });

  it("returns forbidden when RLS blocks the message content update", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_edit: true,
            external_video_id: null,
            external_video_provider: null,
            message_id: "message-1",
            poll_allow_multiple_votes: null,
            poll_id: null,
            poll_question: null,
            poll_vote_count: 0,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.updateContent({
        content: "Mensaje editado",
        messageId: "message-1",
        title: "Titulo editado",
        tribeSlug: "matematica-pro",
        userId: "author-1",
      })
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("replaces the poll options when the poll has no votes yet", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_edit: true,
            external_video_id: null,
            external_video_provider: null,
            message_id: "message-1",
            poll_allow_multiple_votes: false,
            poll_id: "poll-1",
            poll_question: "Vieja pregunta",
            poll_vote_count: 0,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ lock_key: "1" }] })
      .mockResolvedValueOnce({ rows: [{ poll_vote_count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ message_id: "message-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            poll_options: [
              { id: "option-new-1", text: "A" },
              { id: "option-new-2", text: "B" },
            ],
          },
        ],
      });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.updateContent({
        content: "Mensaje editado",
        messageId: "message-1",
        poll: {
          allowMultipleVotes: true,
          options: ["A", "B"],
          question: "Nueva pregunta",
        },
        title: "Titulo editado",
        tribeSlug: "matematica-pro",
        userId: "author-1",
      })
    ).resolves.toMatchObject({
      content: "Mensaje editado",
      messageId: "message-1",
      poll: {
        allowMultipleVotes: true,
        id: "poll-1",
        options: [
          { id: "option-new-1", text: "A" },
          { id: "option-new-2", text: "B" },
        ],
        question: "Nueva pregunta",
        totalVoteCount: 0,
        viewerHasVoted: false,
      },
      status: "updated",
      title: "Titulo editado",
    });

    expect(execute).toHaveBeenCalledTimes(7);
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain(
      "pg_advisory_xact_lock"
    );
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
      "from public.message_poll_votes"
    );
    expect(getSqlText(execute.mock.calls[3]?.[0])).toContain(
      "update public.messages"
    );
    expect(getSqlText(execute.mock.calls[4]?.[0])).toContain(
      "update public.message_polls"
    );
    expect(getSqlText(execute.mock.calls[5]?.[0])).toContain(
      "delete from public.message_poll_options"
    );
    expect(getSqlText(execute.mock.calls[6]?.[0])).toContain(
      "insert into public.message_poll_options"
    );
  });

  it("returns poll_has_votes when a vote arrives before poll option replacement", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_edit: true,
            external_video_id: null,
            external_video_provider: null,
            message_id: "message-1",
            poll_allow_multiple_votes: false,
            poll_id: "poll-1",
            poll_question: "Vieja pregunta",
            poll_vote_count: 0,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ lock_key: "1" }] })
      .mockResolvedValueOnce({ rows: [{ poll_vote_count: 1 }] });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.updateContent({
        content: "Mensaje editado",
        messageId: "message-1",
        poll: {
          allowMultipleVotes: true,
          options: ["A", "B"],
          question: "Nueva pregunta",
        },
        title: "Titulo editado",
        tribeSlug: "matematica-pro",
        userId: "author-1",
      })
    ).resolves.toEqual({ status: "poll_has_votes" });

    expect(execute).toHaveBeenCalledTimes(3);
    expect(getSqlText(execute.mock.calls[1]?.[0])).toContain(
      "pg_advisory_xact_lock"
    );
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
      "from public.message_poll_votes"
    );
  });

  it("returns poll_has_votes when the poll already received votes", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          can_edit: true,
          external_video_id: null,
          external_video_provider: null,
          message_id: "message-1",
          poll_allow_multiple_votes: false,
          poll_id: "poll-1",
          poll_question: "Vieja pregunta",
          poll_vote_count: 3,
          tribe_id: "tribe-1",
        },
      ],
    });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.updateContent({
        content: "Mensaje editado",
        messageId: "message-1",
        poll: {
          allowMultipleVotes: true,
          options: ["A", "B"],
          question: "Nueva pregunta",
        },
        title: "Titulo editado",
        tribeSlug: "matematica-pro",
        userId: "author-1",
      })
    ).resolves.toEqual({ status: "poll_has_votes" });

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("returns poll_missing when there is no poll attached to edit", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          can_edit: true,
          external_video_id: null,
          external_video_provider: null,
          message_id: "message-1",
          poll_allow_multiple_votes: null,
          poll_id: null,
          poll_question: null,
          poll_vote_count: 0,
          tribe_id: "tribe-1",
        },
      ],
    });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.updateContent({
        content: "Mensaje editado",
        messageId: "message-1",
        poll: {
          allowMultipleVotes: false,
          options: ["A", "B"],
          question: "Nueva pregunta",
        },
        title: "Titulo editado",
        tribeSlug: "matematica-pro",
        userId: "author-1",
      })
    ).resolves.toEqual({ status: "poll_missing" });
  });

  it("aborts message updates when prepared images cannot all be attached", async () => {
    let transactionWasAborted = false;
    const execute = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            can_edit: true,
            external_video_id: null,
            external_video_provider: null,
            message_id: "message-1",
            poll_allow_multiple_votes: null,
            poll_id: null,
            poll_question: null,
            poll_vote_count: 0,
            tribe_id: "tribe-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ message_id: "message-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ message_images: [] }] });
    const repository = new PostgresMessageMutationRepository(async (callback) => {
      try {
        return await callback({ execute } as never);
      } catch (error) {
        transactionWasAborted = true;
        throw error;
      }
    });

    await expect(
      repository.updateContent({
        content: "Contenido actualizado",
        images: [{ altText: "", assetId: "asset-1", sortOrder: 0 }],
        messageId: "message-1",
        title: "Titulo actualizado",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({
      status: "invalid_image",
    });

    expect(transactionWasAborted).toBe(true);
  });

  it("returns not_found when the message to edit does not exist", async () => {
    const execute = jest.fn().mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.updateContent({
        content: "Mensaje editado",
        messageId: "missing-message",
        title: "Titulo editado",
        tribeSlug: "matematica-pro",
        userId: "author-1",
      })
    ).resolves.toEqual({ status: "not_found" });
  });

  it("returns forbidden when the viewer is not the author of the message", async () => {
    const execute = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          can_edit: false,
          external_video_id: null,
          external_video_provider: null,
          message_id: "message-1",
          poll_allow_multiple_votes: null,
          poll_id: null,
          poll_question: null,
          poll_vote_count: 0,
          tribe_id: "tribe-1",
        },
      ],
    });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.updateContent({
        content: "Mensaje editado",
        messageId: "message-1",
        title: "Titulo editado",
        tribeSlug: "matematica-pro",
        userId: "other-member",
      })
    ).resolves.toEqual({ status: "forbidden" });
  });
});
