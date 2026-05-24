import { createTribeMessage } from "@/src/modules/messages/application/use-cases/create-tribe-message-use-case";
import { createMessageReply } from "@/src/modules/messages/application/use-cases/create-message-reply-use-case";
import { deleteTribeMessage } from "@/src/modules/messages/application/use-cases/delete-tribe-message-use-case";
import { toggleMessageLike } from "@/src/modules/messages/application/use-cases/toggle-message-like-use-case";
import { toggleMessagePin } from "@/src/modules/messages/application/use-cases/toggle-message-pin-use-case";
import { submitMessagePollVote } from "@/src/modules/messages/application/use-cases/manage-message-polls-use-cases";

describe("message mutation use cases", () => {
  const tribeChannel = {
    accessScope: "tribemates" as const,
    emoji: "🔥",
    id: "channel-ronda",
    name: "Ronda",
    slug: "ronda",
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
        question: "¿Qué vemos?",
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
          question: " ¿Qué vemos? ",
        },
        title: "Bienvenida",
      })
    ).resolves.toEqual({ message: createdMessage, status: "created" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        poll: {
          allowMultipleVotes: true,
          options: ["Álgebra", "Geometría"],
          question: "¿Qué vemos?",
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
        question: "¿Cuál?",
      },
      title: "Doble",
      video: { url: "https://vimeo.com/123456789" },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        poll: {
          allowMultipleVotes: false,
          options: ["A", "B"],
          question: "¿Cuál?",
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
          question: "¿Qué vemos?",
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
      isPinned: false,
      pinnedAt: null,
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
      isPinned: false,
      pinnedAt: null,
      status: "pin_limit_reached",
    });
  });

  it("deletes a tribe message after normalizing the command", async () => {
    const deleteMessage = jest.fn(async () => ({
      status: "deleted" as const,
    }));
    const execute = deleteTribeMessage({
      messageDeletionRepository: { delete: deleteMessage },
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
  });

  it("deduplicates selected poll options before voting", async () => {
    const poll = {
      allowMultipleVotes: false,
      id: "poll-1",
      options: [],
      question: "¿Qué vemos?",
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
