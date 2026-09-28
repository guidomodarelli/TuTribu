import { vi, describe, it, expect } from "vitest";
import { PostgresMessageMutationRepository } from "@/src/modules/messages/infrastructure/repositories/postgres-message-mutation-repository";

describe("PostgresMessageMutationRepository", () => {
  it("creates messages with a title and an active-member write guard", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
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
          status: "created" as const,
        },
      ],
    }); });
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
        files: [],
        media: [],
        pinnedAt: null,
        poll: null,
        replyAuthorsPreview: [],
        replyCount: 0,
        permissions: {
          canDelete: true,
          canEdit: true,
        },
        title: "Anuncio inicial",
      },
      status: "created" as const,
    });

  });

  it("returns inserted poll options when creating a message with a poll", async () => {
    const execute = vi
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
            status: "created" as const,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            poll_allow_multiple_votes: false,
            poll_id: "poll-1",
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
      status: "created" as const,
    });

  });

  it("creates messages with attached external videos as media", async () => {
    const execute = vi
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
            message_content: "Miren este video",
            message_created_at: "2026-04-26T12:00:00.000Z",
            message_id: "message-1",
            message_title: "Recurso",
            message_tribe_id: "tribe-1",
            status: "created" as const,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            message_videos: [
              {
                external_video_id: "dQw4w9WgXcQ",
                external_video_provider: "youtube",
                id: "video-1",
                sort_order: 0,
              },
            ],
          },
        ],
      });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    const result = await repository.create({
      authorId: "member-1",
      channelId: "channel-ronda",
      tribeSlug: "matematica-pro",
      content: "Miren este video",
      title: "Recurso",
      videos: [{ externalId: "dQw4w9WgXcQ", provider: "youtube", sortOrder: 0 }],
    });

    expect(result).toMatchObject({
      message: {
        media: [
          {
            externalId: "dQw4w9WgXcQ",
            id: "video-1",
            kind: "video",
            provider: "youtube",
            sortOrder: 0,
          },
        ],
      },
      status: "created" as const,
    });

  });

  it("attaches prepared images when creating a message", async () => {
    const execute = vi
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
            status: "created" as const,
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
                sort_order: 0,
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
        media: [
          {
            altText: "",
            id: "asset-1",
            kind: "image",
            sortOrder: 0,
            url: "https://imagedelivery.net/account-hash/image-1/public",
          },
        ],
      },
      status: "created" as const,
    });

  });

  it("aborts message creation when prepared images cannot all be attached", async () => {
    let transactionWasAborted = false;
    const execute = vi
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
            status: "created" as const,
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
      status: "invalid_image" as const,
    });

    expect(transactionWasAborted).toBe(true);
  });

  it("toggles likes with an active-member write guard and idempotent upsert", async () => {
    const execute = vi
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
      status: "liked" as const,
    });

  });

  it("returns like failures without message state fields", async () => {
    const execute = vi
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
      status: "not_found" as const,
    });
    await expect(
      repository.toggle({
        tribeSlug: "matematica-pro",
        messageId: "message-1",
        userId: "member-1",
      })
    ).resolves.toEqual({
      status: "forbidden" as const,
    });
  });

  it("pins messages through a limit-guarded transaction", async () => {
    const execute = vi
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
      status: "pinned" as const,
    });

  });

  it("returns pin failures without message state fields", async () => {
    const execute = vi
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
      status: "not_found" as const,
    });
    await expect(
      repository.togglePin({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "leader-1",
      })
    ).resolves.toEqual({
      status: "forbidden" as const,
    });
  });

  it("blocks pinning when the tribe pin limit is reached", async () => {
    const execute = vi
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
      status: "pin_limit_reached" as const,
    });
  });

  it("returns the concurrent pin state when another request pinned the same message after locking", async () => {
    const execute = vi
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
      status: "pinned" as const,
    });

  });

  it("unpins an already pinned message", async () => {
    const execute = vi
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
      status: "unpinned" as const,
    });
  });

  it("serializes single-choice poll votes and returns compact poll results", async () => {
    const execute = vi
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
              selected_by_viewer: false,
            total_vote_count: "1",
            vote_count: "0",
          },
          {
            allow_multiple_votes: false,
            option_id: "option-2",
            option_text: "Geometría",
            poll_id: "poll-1",
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
      status: "voted" as const,
    });

  });

  it("returns forbidden before validating options when the viewer cannot write poll votes", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
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
      status: "forbidden" as const,
    });

  });

  it("deletes a full message through author or staff permissions", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [{ status: "deleted" as const }],
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
    ).resolves.toEqual({ status: "deleted" as const });

  });

  it("maps missing and unauthorized message deletion outcomes", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ status: "not_found" as const }] })
      .mockResolvedValueOnce({ rows: [{ status: "forbidden" as const }] });
    const repository = new PostgresMessageMutationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.delete({
        messageId: "missing-message",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({ status: "not_found" as const });
    await expect(
      repository.delete({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "member-2",
      })
    ).resolves.toEqual({ status: "forbidden" as const });
  });

  it("serializes multiple-choice poll votes before replacing the viewer selections", async () => {
    const execute = vi
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
              selected_by_viewer: true,
            total_vote_count: "2",
            vote_count: "1",
          },
          {
            allow_multiple_votes: true,
            option_id: "option-2",
            option_text: "Geometría",
            poll_id: "poll-1",
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
      status: "voted" as const,
    });

  });

  it("creates replies with the returned reply view model", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          reply_author_id: "member-1",
          reply_author_image: null,
          reply_author_name: "Grace Hopper",
          reply_author_role: "tribemate",
          reply_content: "Excelente clase",
          reply_created_at: "2026-04-26T12:05:00.000Z",
          reply_id: "reply-1",
          status: "created" as const,
        },
      ],
    }); });
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
      status: "created" as const,
    });

  });

  it("updates the message created_at through the leader-guarded statement", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          message_created_at: "2026-04-01T10:00:00.000Z",
          status: "updated" as const,
        },
      ],
    }); });
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
      status: "updated" as const,
    });

  });

  it("returns not_found when the message does not exist", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          message_created_at: null,
          status: "not_found" as const,
        },
      ],
    }); });
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
    ).resolves.toEqual({ status: "not_found" as const });
  });

  it("returns forbidden when the viewer cannot edit the message created_at", async () => {
    const execute = vi.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async (...args: unknown[]) => { void args; return ({
      rows: [
        {
          message_created_at: null,
          status: "forbidden" as const,
        },
      ],
    }); });
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
    ).resolves.toEqual({ status: "forbidden" as const });
  });

  it("updates the message title and content through the author-guarded statement", async () => {
    const execute = vi
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
      status: "updated" as const,
      title: "Titulo editado",
    });

  });

  it("returns forbidden when RLS blocks the message content update", async () => {
    const execute = vi
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
    ).resolves.toEqual({ status: "forbidden" as const });
  });

  it("replaces the poll options when the poll has no votes yet", async () => {
    const execute = vi
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
        totalVoteCount: 0,
        viewerHasVoted: false,
      },
      status: "updated" as const,
      title: "Titulo editado",
    });

  });

  it("returns poll_has_votes when a vote arrives before poll option replacement", async () => {
    const execute = vi
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
        },
        title: "Titulo editado",
        tribeSlug: "matematica-pro",
        userId: "author-1",
      })
    ).resolves.toEqual({ status: "poll_has_votes" as const });

  });

  it("returns poll_has_votes when the poll already received votes", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          can_edit: true,
          external_video_id: null,
          external_video_provider: null,
          message_id: "message-1",
          poll_allow_multiple_votes: false,
          poll_id: "poll-1",
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
        },
        title: "Titulo editado",
        tribeSlug: "matematica-pro",
        userId: "author-1",
      })
    ).resolves.toEqual({ status: "poll_has_votes" as const });

  });

  it("returns poll_missing when there is no poll attached to edit", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          can_edit: true,
          external_video_id: null,
          external_video_provider: null,
          message_id: "message-1",
          poll_allow_multiple_votes: null,
          poll_id: null,
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
        },
        title: "Titulo editado",
        tribeSlug: "matematica-pro",
        userId: "author-1",
      })
    ).resolves.toEqual({ status: "poll_missing" as const });
  });

  it("aborts message updates when prepared images cannot all be attached", async () => {
    let transactionWasAborted = false;
    const execute = vi
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
      status: "invalid_image" as const,
    });

    expect(transactionWasAborted).toBe(true);
  });

  it("returns not_found when the message to edit does not exist", async () => {
    const execute = vi.fn().mockResolvedValueOnce({ rows: [] });
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
    ).resolves.toEqual({ status: "not_found" as const });
  });

  it("returns forbidden when the viewer is not the author of the message", async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          can_edit: false,
          external_video_id: null,
          external_video_provider: null,
          message_id: "message-1",
          poll_allow_multiple_votes: null,
          poll_id: null,
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
    ).resolves.toEqual({ status: "forbidden" as const });
  });
});
