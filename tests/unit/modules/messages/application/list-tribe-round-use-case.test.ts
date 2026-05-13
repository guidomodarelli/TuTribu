import { listTribeRound } from "@/src/modules/messages/application/use-cases/list-tribe-round-use-case";

describe("listTribeRound", () => {
  const channel = {
    accessScope: "tribemates" as const,
    emoji: "🔥",
    id: "channel-ronda",
    name: "Ronda",
    slug: "ronda",
    sortOrder: 20,
  };

  it("returns messages and enables participation for active members", async () => {
    const listSharedDataByTribeSlug = jest.fn(async () => ({
      activeChannelId: null,
      channels: [channel],
      messages: [
        {
          id: "message-1",
          author: {
            id: "leader-1",
            name: "Ada Lovelace",
            role: "leader" as const,
            avatarFallback: "AL",
            image: null,
          },
          channel,
          replies: [],
          content: "Bienvenida al grupo",
          createdAt: "2026-04-26T12:00:00.000Z",
          likeCount: 1,
          title: "Bienvenida",
        },
      ],
    }));
    const listViewerStateByTribeSlug = jest.fn(async () => ({
      likedMessageIds: ["message-1"],
      viewerPermissions: {
        canReply: true,
        canCreateMessage: true,
        canReact: true,
      },
    }));
    const messageRoundReadRepository = {
      listByTribeSlug: jest.fn(),
      listSharedDataByTribeSlug,
      listViewerStateByTribeSlug,
    };
    const execute = listTribeRound({ messageRoundReadRepository });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toEqual({
      activeChannelId: null,
      channels: [channel],
      viewerPermissions: {
        canReply: true,
        canCreateMessage: true,
        canReact: true,
      },
      messages: [
        expect.objectContaining({
          id: "message-1",
          likedByViewer: true,
          likeCount: 1,
        }),
      ],
    });
    expect(listSharedDataByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
    expect(listViewerStateByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
    expect(messageRoundReadRepository.listByTribeSlug).not.toHaveBeenCalled();
  });

  it("returns a read-only round for muted members", async () => {
    const execute = listTribeRound({
      messageRoundReadRepository: {
        listByTribeSlug: jest.fn(),
        listSharedDataByTribeSlug: jest.fn(async () => ({
          activeChannelId: null,
          channels: [channel],
          messages: [],
        })),
        listViewerStateByTribeSlug: jest.fn(async () => ({
          likedMessageIds: [],
          viewerPermissions: {
            canReply: false,
            canCreateMessage: false,
            canReact: false,
          },
        })),
      },
    });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toEqual({
      activeChannelId: null,
      channels: [channel],
      viewerPermissions: {
        canReply: false,
        canCreateMessage: false,
        canReact: false,
      },
      messages: [],
    });
  });

  it("uses the injected shared round reader so cached data stays separate from viewer state", async () => {
    const listSharedDataByTribeSlug = jest.fn();
    const listViewerStateByTribeSlug = jest.fn(async () => ({
      likedMessageIds: [],
      viewerPermissions: {
        canReply: true,
        canCreateMessage: true,
        canReact: true,
      },
    }));
    const listCachedTribeRoundSharedData = jest.fn(async () => ({
      activeChannelId: null,
      channels: [channel],
      messages: [],
    }));
    const execute = listTribeRound({
      listCachedTribeRoundSharedData,
      messageRoundReadRepository: {
        listByTribeSlug: jest.fn(),
        listSharedDataByTribeSlug,
        listViewerStateByTribeSlug,
      },
    });

    await expect(
      execute({
        tribeSlug: " matematica-pro ",
        viewerId: "member-1",
      })
    ).resolves.toEqual({
      activeChannelId: null,
      channels: [channel],
      viewerPermissions: {
        canReply: true,
        canCreateMessage: true,
        canReact: true,
      },
      messages: [],
    });

    expect(listCachedTribeRoundSharedData).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
    expect(listSharedDataByTribeSlug).not.toHaveBeenCalled();
    expect(listViewerStateByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
  });
});
