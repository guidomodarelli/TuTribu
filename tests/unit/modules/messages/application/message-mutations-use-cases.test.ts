import { createTribeMessage } from "@/src/modules/messages/application/use-cases/create-tribe-message-use-case";
import { createMessageReply } from "@/src/modules/messages/application/use-cases/create-message-reply-use-case";
import { toggleMessageLike } from "@/src/modules/messages/application/use-cases/toggle-message-like-use-case";

describe("message mutation use cases", () => {
  const tribeChannel = {
    accessScope: "tribemates" as const,
    emoji: "💬",
    id: "channel-general",
    name: "General",
    slug: "general",
    sortOrder: 20,
  };

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
        channelId: "channel-general",
        tribeSlug: "matematica-pro",
        content: "Primera mensaje",
        title: "Bienvenida",
      })
    ).resolves.toEqual({ message: createdMessage, status: "created" });
    expect(create).toHaveBeenCalledWith({
      authorId: "member-1",
      channelId: "channel-general",
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
        channelId: "channel-general",
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
        channelId: "channel-general",
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
});
