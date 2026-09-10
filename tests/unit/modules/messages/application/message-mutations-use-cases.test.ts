import { vi, describe, it, expect } from "vitest";
import { createTribeMessage } from "@/src/modules/messages/application/use-cases/create-tribe-message-use-case";
import { createMessageReply } from "@/src/modules/messages/application/use-cases/create-message-reply-use-case";
import { deleteTribeMessage } from "@/src/modules/messages/application/use-cases/delete-tribe-message-use-case";
import { toggleMessageLike } from "@/src/modules/messages/application/use-cases/toggle-message-like-use-case";
import { toggleMessagePin } from "@/src/modules/messages/application/use-cases/toggle-message-pin-use-case";
import { submitMessagePollVote } from "@/src/modules/messages/application/use-cases/manage-message-polls-use-cases";
import { updateTribeMessageContent } from "@/src/modules/messages/application/use-cases/update-tribe-message-content-use-case";
import { updateTribeMessageCreatedAt } from "@/src/modules/messages/application/use-cases/update-tribe-message-created-at-use-case";

describe("message mutation use cases", () => {
  const tribeChannel = {
    accessScope: "tribemates" as const,
    emoji: "🔥",
    id: "channel-ronda",
    name: "Ronda",
    slug: "ronda",
    sortOrder: 20,
  };
  const firstImageAssetId = "7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2";
  const secondImageAssetId = "8b9fda6e-6ef2-4a4d-bd8d-00b0e04b6b55";

  it("creates a tribe message when content is valid", async () => {
    const createdMessage = { replyCount: 0,
      id: "message-1",
      author: {
        id: "member-1",
        name: "Grace Hopper",
        role: "tribemate" as const,
        avatarFallback: "GH",
        image: null,
      },
      channel: tribeChannel,
      replies: [],
      content: "Primera mensaje",
      createdAt: "2026-04-26T12:00:00.000Z",
      likedByViewer: false,
      likeCount: 0,
      title: "Bienvenida",
    };
    const create = vi.fn(async () => ({
      message: createdMessage,
      status: "created" as const,
    }));
    const execute = createTribeMessage({
      messageCreationRepository: { create },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Primera mensaje",
        title: "Bienvenida",
      })
    ).resolves.toEqual({ message: createdMessage, status: "created" as const });
    expect(create).toHaveBeenCalledWith({
      authorId: "member-1",
      channelId: "channel-ronda",
      tribeSlug: "matematica-pro",
      content: "Primera mensaje",
      title: "Bienvenida",
    });
  });

  it("rejects a blank tribe message title before calling the repository", async () => {
    const create = vi.fn();
    const execute = createTribeMessage({
      messageCreationRepository: { create },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Primera mensaje",
        title: "   ",
      })
    ).resolves.toEqual({ status: "invalid_content" as const });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a blank tribe message before calling the repository", async () => {
    const create = vi.fn();
    const execute = createTribeMessage({
      messageCreationRepository: { create },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "   ",
        title: "Bienvenida",
      })
    ).resolves.toEqual({ status: "invalid_content" as const });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a message without channel before calling the repository", async () => {
    const create = vi.fn();
    const execute = createTribeMessage({
      messageCreationRepository: { create },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "   ",
        tribeSlug: "matematica-pro",
        content: "Primera mensaje",
        title: "Bienvenida",
      })
    ).resolves.toEqual({ status: "invalid_channel" as const });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a flat message reply when content is valid", async () => {
    const createdReply = {
      id: "reply-1",
      author: {
        id: "member-1",
        name: "Grace Hopper",
        role: "tribemate" as const,
        avatarFallback: "GH",
        image: null,
      },
      content: "Excelente clase",
      createdAt: "2026-04-26T12:05:00.000Z",
    };
    const create = vi.fn(async () => ({
      reply: createdReply,
      status: "created" as const,
    }));
    const execute = createMessageReply({
      messageReplyRepository: { create },
    });

    await expect(
      execute({
        authorId: "member-1",
        tribeSlug: "matematica-pro",
        content: "Excelente clase",
        messageId: "message-1",
      })
    ).resolves.toEqual({ reply: createdReply, status: "created" as const });
  });

  it("toggles a like reaction idempotently", async () => {
    const toggle = vi.fn(async () => ({
      likedByViewer: true,
      likeCount: 3,
      status: "liked" as const,
    }));
    const execute = toggleMessageLike({
      messageReactionRepository: { toggle },
    });

    await expect(
      execute({
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

  it("creates a tribe message with a normalized poll", async () => {
    const createdMessage = { replyCount: 0,
      id: "message-1",
      author: {
        id: "member-1",
        name: "Grace Hopper",
        role: "tribemate" as const,
        avatarFallback: "GH",
        image: null,
      },
      channel: tribeChannel,
      replies: [],
      content: "Primera mensaje",
      createdAt: "2026-04-26T12:00:00.000Z",
      likedByViewer: false,
      likeCount: 0,
      poll: {
        allowMultipleVotes: true,
        id: "poll-1",
        options: [],
        totalVoteCount: 0,
        viewerHasVoted: false,
      },
      title: "Bienvenida",
    };
    const create = vi.fn(async () => ({
      message: createdMessage,
      status: "created" as const,
    }));
    const execute = createTribeMessage({
      messageCreationRepository: { create },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Primera mensaje",
        poll: {
          allowMultipleVotes: true,
          options: [" Álgebra ", "   ", " Geometría "],
        },
        title: "Bienvenida",
      })
    ).resolves.toEqual({ message: createdMessage, status: "created" as const });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        poll: {
          allowMultipleVotes: true,
          options: ["Álgebra", "Geometría"],
        },
      })
    );
  });

  it("creates a tribe message with a parsed external video", async () => {
    const createdMessage = { replyCount: 0,
      id: "message-1",
      author: {
        id: "member-1",
        name: "Grace Hopper",
        role: "tribemate" as const,
        avatarFallback: "GH",
        image: null,
      },
      channel: tribeChannel,
      replies: [],
      content: "Miren este video",
      createdAt: "2026-04-26T12:00:00.000Z",
      likedByViewer: false,
      likeCount: 0,
      media: [
        {
          externalId: "dQw4w9WgXcQ",
          id: "video-1",
          kind: "video" as const,
          provider: "youtube" as const,
          sortOrder: 0,
        },
      ],
      title: "Recurso",
    };
    const create = vi.fn(async () => ({
      message: createdMessage,
      status: "created" as const,
    }));
    const execute = createTribeMessage({
      messageCreationRepository: { create },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Miren este video",
        media: [
          { kind: "video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
        ],
        title: "Recurso",
      })
    ).resolves.toEqual({ message: createdMessage, status: "created" as const });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        videos: [
          {
            externalId: "dQw4w9WgXcQ",
            provider: "youtube",
            sortOrder: 0,
          },
        ],
      })
    );
  });

  it("creates a tribe message after preparing uploaded images", async () => {
    const create = vi.fn(async () => ({
      message: { replyCount: 0,
        id: "message-1",
        author: {
          id: "member-1",
          name: "Grace Hopper",
          role: "tribemate" as const,
          avatarFallback: "GH",
          image: null,
        },
        channel: tribeChannel,
        replies: [],
        content: "Miren estas capturas",
        createdAt: "2026-04-26T12:00:00.000Z",
        likedByViewer: false,
        likeCount: 0,
        media: [
          {
            altText: "",
            id: firstImageAssetId,
            kind: "image" as const,
            sortOrder: 0,
            url: "https://imagedelivery.net/account-hash/image-1/public",
          },
        ],
        title: "Capturas",
      },
      status: "created" as const,
    }));
    const prepareForAttachment = vi.fn(async () => ({
      images: [{ altText: "", assetId: firstImageAssetId, sortOrder: 0 }],
      status: "ready" as const,
    }));
    const execute = createTribeMessage({
      messageCreationRepository: { create },
      messageImageRepository: {
        prepareForAttachment,
      },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Miren estas capturas",
        media: [{ assetId: ` ${firstImageAssetId} `, kind: "image" }],
        title: "Capturas",
      })
    ).resolves.toMatchObject({ status: "created" as const });
    expect(prepareForAttachment).toHaveBeenCalledWith({
      images: [{ altText: "", assetId: firstImageAssetId, sortOrder: 0 }],
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [{ altText: "", assetId: firstImageAssetId, sortOrder: 0 }],
      })
    );
  });

  it("deletes prepared image drafts when message creation is rejected", async () => {
    const create = vi.fn(async () => ({
      status: "invalid_channel" as const,
    }));
    const prepareForAttachment = vi.fn(async () => ({
      images: [
        { altText: "", assetId: firstImageAssetId, sortOrder: 0 },
        { altText: "", assetId: secondImageAssetId, sortOrder: 1 },
      ],
      status: "ready" as const,
    }));
    const deleteImage = vi.fn(async () => ({
      status: "deleted" as const,
    }));
    const execute = createTribeMessage({
      messageCreationRepository: { create },
      messageImageRepository: {
        prepareForAttachment,
        deleteImage,
      },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Miren estas capturas",
        media: [
          { assetId: firstImageAssetId, kind: "image" },
          { assetId: secondImageAssetId, kind: "image" },
        ],
        title: "Capturas",
      })
    ).resolves.toEqual({ status: "invalid_channel" as const });
    expect(deleteImage).toHaveBeenCalledTimes(2);
    expect(deleteImage).toHaveBeenCalledWith({
      assetId: firstImageAssetId,
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
    expect(deleteImage).toHaveBeenCalledWith({
      assetId: secondImageAssetId,
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
  });

  it("deletes prepared image drafts when message creation throws", async () => {
    const creationError = new Error("database insert failed");
    const create = vi.fn(async () => {
      throw creationError;
    });
    const prepareForAttachment = vi.fn(async () => ({
      images: [{ altText: "", assetId: firstImageAssetId, sortOrder: 0 }],
      status: "ready" as const,
    }));
    const deleteImage = vi.fn(async () => ({
      status: "deleted" as const,
    }));
    const execute = createTribeMessage({
      messageCreationRepository: { create },
      messageImageRepository: {
        prepareForAttachment,
        deleteImage,
      },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Miren estas capturas",
        media: [{ assetId: firstImageAssetId, kind: "image" }],
        title: "Capturas",
      })
    ).rejects.toThrow(creationError);
    expect(deleteImage).toHaveBeenCalledWith({
      assetId: firstImageAssetId,
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
  });

  it("creates a tribe message mixing images and videos with a shared global order", async () => {
    const create = vi.fn(async () => ({
      message: { replyCount: 0,
        id: "message-1",
        author: {
          id: "member-1",
          name: "Grace Hopper",
          role: "tribemate" as const,
          avatarFallback: "GH",
          image: null,
        },
        channel: tribeChannel,
        replies: [],
        content: "Imagen y video",
        createdAt: "2026-04-26T12:00:00.000Z",
        likedByViewer: false,
        likeCount: 0,
        title: "Mixto",
      },
      status: "created" as const,
    }));
    const prepareForAttachment = vi.fn(async () => ({
      images: [{ altText: "", assetId: firstImageAssetId, sortOrder: 0 }],
      status: "ready" as const,
    }));
    const execute = createTribeMessage({
      messageCreationRepository: { create },
      messageImageRepository: { prepareForAttachment },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Imagen y video",
        media: [
          { assetId: firstImageAssetId, kind: "image" },
          { kind: "video", url: "https://vimeo.com/123456789" },
        ],
        title: "Mixto",
      })
    ).resolves.toMatchObject({ status: "created" as const });
    expect(prepareForAttachment).toHaveBeenCalledWith({
      images: [{ altText: "", assetId: firstImageAssetId, sortOrder: 0 }],
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [{ altText: "", assetId: firstImageAssetId, sortOrder: 0 }],
        videos: [
          { externalId: "123456789", provider: "vimeo", sortOrder: 1 },
        ],
      })
    );
  });

  it("rejects messages with more than ten combined media before preparing attachments", async () => {
    const create = vi.fn();
    const prepareForAttachment = vi.fn();
    const execute = createTribeMessage({
      messageCreationRepository: { create },
      messageImageRepository: {
        prepareForAttachment,
      },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Demasiados medios",
        media: Array.from({ length: 11 }, () => ({
          kind: "video" as const,
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        })),
        title: "Medios",
      })
    ).resolves.toEqual({ status: "invalid_media" as const });
    expect(prepareForAttachment).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects duplicated image asset ids before preparing attachments", async () => {
    const create = vi.fn();
    const prepareForAttachment = vi.fn();
    const execute = createTribeMessage({
      messageCreationRepository: { create },
      messageImageRepository: {
        prepareForAttachment,
      },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Duplicadas",
        media: [
          { assetId: firstImageAssetId, kind: "image" },
          { assetId: ` ${firstImageAssetId} `, kind: "image" },
        ],
        title: "Capturas",
      })
    ).resolves.toEqual({ status: "invalid_image" as const });
    expect(prepareForAttachment).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects non UUID image asset ids before preparing attachments", async () => {
    const create = vi.fn();
    const prepareForAttachment = vi.fn();
    const execute = createTribeMessage({
      messageCreationRepository: { create },
      messageImageRepository: {
        prepareForAttachment,
      },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Imagen invalida",
        media: [{ assetId: "asset-1", kind: "image" }],
        title: "Capturas",
      })
    ).resolves.toEqual({ status: "invalid_image" as const });
    expect(prepareForAttachment).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an invalid video URL before calling the repository", async () => {
    const create = vi.fn();
    const execute = createTribeMessage({
      messageCreationRepository: { create },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Miren este video",
        media: [{ kind: "video", url: "not-a-video-url" }],
        title: "Recurso",
      })
    ).resolves.toEqual({ status: "invalid_video_url" as const });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a tribe message with both poll and video", async () => {
    const create = vi.fn(async () => ({
      message: { replyCount: 0,
        id: "message-1",
        author: {
          id: "member-1",
          name: "Grace Hopper",
          role: "tribemate" as const,
          avatarFallback: "GH",
          image: null,
        },
        channel: tribeChannel,
        replies: [],
        content: "Voten y miren",
        createdAt: "2026-04-26T12:00:00.000Z",
        likedByViewer: false,
        likeCount: 0,
        title: "Doble",
      },
      status: "created" as const,
    }));
    const execute = createTribeMessage({
      messageCreationRepository: { create },
    });

    await execute({
      authorId: "member-1",
      channelId: "channel-ronda",
      tribeSlug: "matematica-pro",
      content: "Voten y miren",
      media: [{ kind: "video", url: "https://vimeo.com/123456789" }],
      poll: {
        allowMultipleVotes: false,
        options: ["A", "B"],
      },
      title: "Doble",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        poll: {
          allowMultipleVotes: false,
          options: ["A", "B"],
        },
        videos: [
          {
            externalId: "123456789",
            provider: "vimeo",
            sortOrder: 0,
          },
        ],
      })
    );
  });

  it("rejects a poll with less than two options before creating a message", async () => {
    const create = vi.fn();
    const execute = createTribeMessage({
      messageCreationRepository: { create },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Primera mensaje",
        poll: {
          allowMultipleVotes: false,
          options: ["Álgebra", " "],
        },
        title: "Bienvenida",
      })
    ).resolves.toEqual({ status: "invalid_poll" as const });
    expect(create).not.toHaveBeenCalled();
  });

  it("pins a message through the pin repository", async () => {
    const togglePin = vi.fn(async () => ({
      isPinned: true,
      pinnedAt: "2026-04-26T13:00:00.000Z",
      status: "pinned" as const,
    }));
    const execute = toggleMessagePin({
      messagePinRepository: { togglePin },
    });

    await expect(
      execute({
        tribeSlug: " matematica-pro ",
        messageId: "message-1",
        userId: "leader-1",
      })
    ).resolves.toEqual({
      isPinned: true,
      pinnedAt: "2026-04-26T13:00:00.000Z",
      status: "pinned" as const,
    });
    expect(togglePin).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      messageId: "message-1",
      userId: "leader-1",
    });
  });

  it("blocks a fourth pinned message through the pin repository", async () => {
    const togglePin = vi.fn(async () => ({
      status: "pin_limit_reached" as const,
    }));
    const execute = toggleMessagePin({
      messagePinRepository: { togglePin },
    });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        messageId: "message-4",
        userId: "leader-1",
      })
    ).resolves.toEqual({
      status: "pin_limit_reached" as const,
    });
  });

  it("deletes a tribe message after normalizing the command", async () => {
    const deleteMessage = vi.fn(async () => ({
      status: "deleted" as const,
    }));
    const deletePendingImages = vi.fn(async () => undefined);
    const execute = deleteTribeMessage({
      messageDeletionRepository: { delete: deleteMessage },
      messageImageRepository: { deletePendingImages },
    });

    await expect(
      execute({
        messageId: "message-1",
        tribeSlug: " matematica-pro ",
        userId: " member-1 ",
      })
    ).resolves.toEqual({ status: "deleted" as const });
    expect(deleteMessage).toHaveBeenCalledWith({
      messageId: "message-1",
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
    expect(deletePendingImages).toHaveBeenCalledWith({
      messageId: "message-1",
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
  });

  it("does not clean pending images when message deletion is denied", async () => {
    const deleteMessage = vi.fn(async () => ({
      status: "forbidden" as const,
    }));
    const deletePendingImages = vi.fn();
    const execute = deleteTribeMessage({
      messageDeletionRepository: { delete: deleteMessage },
      messageImageRepository: { deletePendingImages },
    });

    await expect(
      execute({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({ status: "forbidden" as const });
    expect(deletePendingImages).not.toHaveBeenCalled();
  });

  it("updates the message created_at after normalizing the command", async () => {
    const updateCreatedAt = vi.fn(async () => ({
      createdAt: "2026-04-01T10:00:00.000Z",
      status: "updated" as const,
    }));
    const execute = updateTribeMessageCreatedAt({
      messageCreatedAtUpdateRepository: { updateCreatedAt },
    });

    await expect(
      execute({
        createdAt: "  2026-04-01T10:00:00Z  ",
        messageId: "message-1",
        tribeSlug: " matematica-pro ",
        userId: " leader-1 ",
      })
    ).resolves.toEqual({
      createdAt: "2026-04-01T10:00:00.000Z",
      status: "updated" as const,
    });
    expect(updateCreatedAt).toHaveBeenCalledWith({
      createdAt: "2026-04-01T10:00:00.000Z",
      messageId: "message-1",
      tribeSlug: "matematica-pro",
      userId: "leader-1",
    });
  });

  it("rejects an invalid created_at before calling the repository", async () => {
    const updateCreatedAt = vi.fn();
    const execute = updateTribeMessageCreatedAt({
      messageCreatedAtUpdateRepository: { updateCreatedAt },
    });

    await expect(
      execute({
        createdAt: "not-a-date",
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "leader-1",
      })
    ).resolves.toEqual({ status: "invalid_content" as const });
    expect(updateCreatedAt).not.toHaveBeenCalled();
  });

  it("rejects a blank created_at before calling the repository", async () => {
    const updateCreatedAt = vi.fn();
    const execute = updateTribeMessageCreatedAt({
      messageCreatedAtUpdateRepository: { updateCreatedAt },
    });

    await expect(
      execute({
        createdAt: "   ",
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        userId: "leader-1",
      })
    ).resolves.toEqual({ status: "invalid_content" as const });
    expect(updateCreatedAt).not.toHaveBeenCalled();
  });

  it("updates the message content after normalizing the command", async () => {
    const updateContent = vi.fn(async () => ({
      content: "Mensaje editado",
      messageId: "message-1",
      status: "updated" as const,
      title: "Titulo editado",
    }));
    const execute = updateTribeMessageContent({
      messageContentUpdateRepository: { updateContent },
    });

    await expect(
      execute({
        content: "  Mensaje editado  ",
        messageId: " message-1 ",
        title: "  Titulo editado  ",
        tribeSlug: " matematica-pro ",
        userId: " member-1 ",
      })
    ).resolves.toEqual({
      content: "Mensaje editado",
      messageId: "message-1",
      status: "updated" as const,
      title: "Titulo editado",
    });
    expect(updateContent).toHaveBeenCalledWith({
      content: "Mensaje editado",
      messageId: "message-1",
      title: "Titulo editado",
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
  });

  it("updates message images and deletes removed remote assets after editing", async () => {
    const updateContent = vi.fn(async () => ({
      content: "Mensaje editado",
      media: [
        {
          altText: "",
          id: secondImageAssetId,
          kind: "image" as const,
          sortOrder: 0,
          url: "https://imagedelivery.net/account-hash/image-2/public",
        },
      ],
      messageId: "message-1",
      status: "updated" as const,
      title: "Titulo editado",
    }));
    const prepareForAttachment = vi.fn(async () => ({
      images: [{ altText: "", assetId: secondImageAssetId, sortOrder: 0 }],
      status: "ready" as const,
    }));
    const deletePendingImages = vi.fn(async () => undefined);
    const execute = updateTribeMessageContent({
      messageContentUpdateRepository: { updateContent },
      messageImageRepository: {
        prepareForAttachment,
        deletePendingImages,
      },
    });

    await expect(
      execute({
        content: "  Mensaje editado  ",
        media: [{ assetId: ` ${secondImageAssetId} `, kind: "image" }],
        messageId: " message-1 ",
        title: "  Titulo editado  ",
        tribeSlug: " matematica-pro ",
        userId: " member-1 ",
      })
    ).resolves.toMatchObject({
      media: [{ id: secondImageAssetId }],
      status: "updated" as const,
    });
    expect(prepareForAttachment).toHaveBeenCalledWith({
      images: [{ altText: "", assetId: secondImageAssetId, sortOrder: 0 }],
      messageId: "message-1",
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
    expect(updateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [{ altText: "", assetId: secondImageAssetId, sortOrder: 0 }],
      })
    );
    expect(deletePendingImages).toHaveBeenCalledWith({
      messageId: "message-1",
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
  });

  it("rejects non UUID image asset ids before updating message images", async () => {
    const updateContent = vi.fn();
    const prepareForAttachment = vi.fn();
    const deletePendingImages = vi.fn();
    const execute = updateTribeMessageContent({
      messageContentUpdateRepository: { updateContent },
      messageImageRepository: {
        prepareForAttachment,
        deletePendingImages,
      },
    });

    await expect(
      execute({
        content: "Mensaje editado",
        media: [{ assetId: "asset-1", kind: "image" }],
        messageId: "message-1",
        title: "Titulo editado",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({ status: "invalid_image" as const });
    expect(prepareForAttachment).not.toHaveBeenCalled();
    expect(updateContent).not.toHaveBeenCalled();
    expect(deletePendingImages).not.toHaveBeenCalled();
  });

  it("rejects an empty title before calling the message content repository", async () => {
    const updateContent = vi.fn();
    const execute = updateTribeMessageContent({
      messageContentUpdateRepository: { updateContent },
    });

    await expect(
      execute({
        content: "Mensaje editado",
        messageId: "message-1",
        title: "   ",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({ status: "invalid_content" as const });
    expect(updateContent).not.toHaveBeenCalled();
  });

  it("rejects an empty content before calling the message content repository", async () => {
    const updateContent = vi.fn();
    const execute = updateTribeMessageContent({
      messageContentUpdateRepository: { updateContent },
    });

    await expect(
      execute({
        content: "   ",
        messageId: "message-1",
        title: "Titulo",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({ status: "invalid_content" as const });
    expect(updateContent).not.toHaveBeenCalled();
  });

  it("deduplicates selected poll options before voting", async () => {
    const poll = {
      allowMultipleVotes: false,
      id: "poll-1",
      options: [],
      totalVoteCount: 0,
      viewerHasVoted: false,
    };
    const vote = vi.fn(async () => ({
      poll,
      status: "voted" as const,
    }));
    const execute = submitMessagePollVote({
      messagePollRepository: {
        vote,
      },
    });

    await expect(
      execute({
        messageId: "message-1",
        optionIds: [" option-1 ", "option-1", "option-2"],
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({ poll, status: "voted" as const });
    expect(vote).toHaveBeenCalledWith({
      messageId: "message-1",
      optionIds: ["option-1", "option-2"],
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
  });
});
