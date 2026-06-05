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
  const thirdImageAssetId = "9a5d94c0-2c3b-4c62-9c93-f08d7d8f6d44";
  const fourthImageAssetId = "a4bb88a6-d77e-4d2f-8e38-39b7fbb6cbf5";
  const fifthImageAssetId = "b1243c2f-92d3-4dd2-ae88-45acb6bbd8cf";

  it("creates a tribe message when content is valid", async () => {
    const createdMessage = {
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
    const create = jest.fn(async () => ({
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
    ).resolves.toEqual({ message: createdMessage, status: "created" });
    expect(create).toHaveBeenCalledWith({
      authorId: "member-1",
      channelId: "channel-ronda",
      tribeSlug: "matematica-pro",
      content: "Primera mensaje",
      title: "Bienvenida",
    });
  });

  it("rejects a blank tribe message title before calling the repository", async () => {
    const create = jest.fn();
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
    ).resolves.toEqual({ status: "invalid_content" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a blank tribe message before calling the repository", async () => {
    const create = jest.fn();
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
    ).resolves.toEqual({ status: "invalid_content" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a message without channel before calling the repository", async () => {
    const create = jest.fn();
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
    ).resolves.toEqual({ status: "invalid_channel" });
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
    const create = jest.fn(async () => ({
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
    ).resolves.toEqual({ reply: createdReply, status: "created" });
  });

  it("toggles a like reaction idempotently", async () => {
    const toggle = jest.fn(async () => ({
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
      status: "liked",
    });
  });

  it("creates a tribe message with a normalized poll", async () => {
    const createdMessage = {
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
    const create = jest.fn(async () => ({
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
    ).resolves.toEqual({ message: createdMessage, status: "created" });
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
    const createdMessage = {
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
      title: "Recurso",
      video: {
        externalId: "dQw4w9WgXcQ",
        provider: "youtube" as const,
      },
    };
    const create = jest.fn(async () => ({
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
        title: "Recurso",
        video: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      })
    ).resolves.toEqual({ message: createdMessage, status: "created" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        video: {
          externalId: "dQw4w9WgXcQ",
          provider: "youtube",
        },
      })
    );
  });

  it("creates a tribe message after preparing uploaded images", async () => {
    const create = jest.fn(async () => ({
      message: {
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
        images: [
          {
            altText: "",
            id: firstImageAssetId,
            url: "https://imagedelivery.net/account-hash/image-1/public",
          },
        ],
        likedByViewer: false,
        likeCount: 0,
        title: "Capturas",
      },
      status: "created" as const,
    }));
    const prepareForAttachment = jest.fn(async () => ({
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
        images: [{ assetId: ` ${firstImageAssetId} ` }],
        title: "Capturas",
      })
    ).resolves.toMatchObject({ status: "created" });
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
    const create = jest.fn(async () => ({
      status: "invalid_channel" as const,
    }));
    const prepareForAttachment = jest.fn(async () => ({
      images: [
        { altText: "", assetId: firstImageAssetId, sortOrder: 0 },
        { altText: "", assetId: secondImageAssetId, sortOrder: 1 },
      ],
      status: "ready" as const,
    }));
    const deleteImage = jest.fn(async () => ({
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
        images: [
          { assetId: firstImageAssetId },
          { assetId: secondImageAssetId },
        ],
        title: "Capturas",
      })
    ).resolves.toEqual({ status: "invalid_channel" });
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
    const create = jest.fn(async () => {
      throw creationError;
    });
    const prepareForAttachment = jest.fn(async () => ({
      images: [{ altText: "", assetId: firstImageAssetId, sortOrder: 0 }],
      status: "ready" as const,
    }));
    const deleteImage = jest.fn(async () => ({
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
        images: [{ assetId: firstImageAssetId }],
        title: "Capturas",
      })
    ).rejects.toThrow(creationError);
    expect(deleteImage).toHaveBeenCalledWith({
      assetId: firstImageAssetId,
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
  });

  it("rejects messages with more than four images before preparing attachments", async () => {
    const create = jest.fn();
    const prepareForAttachment = jest.fn();
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
        content: "Demasiadas imagenes",
        images: [
          { assetId: firstImageAssetId },
          { assetId: secondImageAssetId },
          { assetId: thirdImageAssetId },
          { assetId: fourthImageAssetId },
          { assetId: fifthImageAssetId },
        ],
        title: "Capturas",
      })
    ).resolves.toEqual({ status: "invalid_image" });
    expect(prepareForAttachment).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects duplicated image asset ids before preparing attachments", async () => {
    const create = jest.fn();
    const prepareForAttachment = jest.fn();
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
        images: [
          { assetId: firstImageAssetId },
          { assetId: ` ${firstImageAssetId} ` },
        ],
        title: "Capturas",
      })
    ).resolves.toEqual({ status: "invalid_image" });
    expect(prepareForAttachment).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects non UUID image asset ids before preparing attachments", async () => {
    const create = jest.fn();
    const prepareForAttachment = jest.fn();
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
        images: [{ assetId: "asset-1" }],
        title: "Capturas",
      })
    ).resolves.toEqual({ status: "invalid_image" });
    expect(prepareForAttachment).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an invalid video URL before calling the repository", async () => {
    const create = jest.fn();
    const execute = createTribeMessage({
      messageCreationRepository: { create },
    });

    await expect(
      execute({
        authorId: "member-1",
        channelId: "channel-ronda",
        tribeSlug: "matematica-pro",
        content: "Miren este video",
        title: "Recurso",
        video: { url: "not-a-video-url" },
      })
    ).resolves.toEqual({ status: "invalid_video_url" });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a tribe message with both poll and video", async () => {
    const create = jest.fn(async () => ({
      message: {
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
      poll: {
        allowMultipleVotes: false,
        options: ["A", "B"],
      },
      title: "Doble",
      video: { url: "https://vimeo.com/123456789" },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        poll: {
          allowMultipleVotes: false,
          options: ["A", "B"],
        },
        video: {
          externalId: "123456789",
          provider: "vimeo",
        },
      })
    );
  });

  it("rejects a poll with less than two options before creating a message", async () => {
    const create = jest.fn();
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
    ).resolves.toEqual({ status: "invalid_poll" });
    expect(create).not.toHaveBeenCalled();
  });

  it("pins a message through the pin repository", async () => {
    const togglePin = jest.fn(async () => ({
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
      status: "pinned",
    });
    expect(togglePin).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      messageId: "message-1",
      userId: "leader-1",
    });
  });

  it("blocks a fourth pinned message through the pin repository", async () => {
    const togglePin = jest.fn(async () => ({
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
      status: "pin_limit_reached",
    });
  });

  it("deletes a tribe message after normalizing the command", async () => {
    const deleteMessage = jest.fn(async () => ({
      status: "deleted" as const,
    }));
    const deletePendingImages = jest.fn(async () => undefined);
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
    ).resolves.toEqual({ status: "deleted" });
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
    const deleteMessage = jest.fn(async () => ({
      status: "forbidden" as const,
    }));
    const deletePendingImages = jest.fn();
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
    ).resolves.toEqual({ status: "forbidden" });
    expect(deletePendingImages).not.toHaveBeenCalled();
  });

  it("updates the message created_at after normalizing the command", async () => {
    const updateCreatedAt = jest.fn(async () => ({
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
      status: "updated",
    });
    expect(updateCreatedAt).toHaveBeenCalledWith({
      createdAt: "2026-04-01T10:00:00.000Z",
      messageId: "message-1",
      tribeSlug: "matematica-pro",
      userId: "leader-1",
    });
  });

  it("rejects an invalid created_at before calling the repository", async () => {
    const updateCreatedAt = jest.fn();
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
    ).resolves.toEqual({ status: "invalid_content" });
    expect(updateCreatedAt).not.toHaveBeenCalled();
  });

  it("rejects a blank created_at before calling the repository", async () => {
    const updateCreatedAt = jest.fn();
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
    ).resolves.toEqual({ status: "invalid_content" });
    expect(updateCreatedAt).not.toHaveBeenCalled();
  });

  it("updates the message content after normalizing the command", async () => {
    const updateContent = jest.fn(async () => ({
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
      status: "updated",
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
    const updateContent = jest.fn(async () => ({
      content: "Mensaje editado",
      images: [
        {
          altText: "",
          id: secondImageAssetId,
          url: "https://imagedelivery.net/account-hash/image-2/public",
        },
      ],
      messageId: "message-1",
      status: "updated" as const,
      title: "Titulo editado",
    }));
    const prepareForAttachment = jest.fn(async () => ({
      images: [{ altText: "", assetId: secondImageAssetId, sortOrder: 0 }],
      status: "ready" as const,
    }));
    const deletePendingImages = jest.fn(async () => undefined);
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
        images: [{ assetId: ` ${secondImageAssetId} ` }],
        messageId: " message-1 ",
        title: "  Titulo editado  ",
        tribeSlug: " matematica-pro ",
        userId: " member-1 ",
      })
    ).resolves.toMatchObject({
      images: [{ id: secondImageAssetId }],
      status: "updated",
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
    const updateContent = jest.fn();
    const prepareForAttachment = jest.fn();
    const deletePendingImages = jest.fn();
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
        images: [{ assetId: "asset-1" }],
        messageId: "message-1",
        title: "Titulo editado",
        tribeSlug: "matematica-pro",
        userId: "member-1",
      })
    ).resolves.toEqual({ status: "invalid_image" });
    expect(prepareForAttachment).not.toHaveBeenCalled();
    expect(updateContent).not.toHaveBeenCalled();
    expect(deletePendingImages).not.toHaveBeenCalled();
  });

  it("rejects an empty title before calling the message content repository", async () => {
    const updateContent = jest.fn();
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
    ).resolves.toEqual({ status: "invalid_content" });
    expect(updateContent).not.toHaveBeenCalled();
  });

  it("rejects an empty content before calling the message content repository", async () => {
    const updateContent = jest.fn();
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
    ).resolves.toEqual({ status: "invalid_content" });
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
    const vote = jest.fn(async () => ({
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
    ).resolves.toEqual({ poll, status: "voted" });
    expect(vote).toHaveBeenCalledWith({
      messageId: "message-1",
      optionIds: ["option-1", "option-2"],
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
  });
});
