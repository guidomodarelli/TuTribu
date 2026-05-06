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
    const messageRoundReadRepository = {
      listByTribeSlug: jest.fn(async () => ({
        activeChannelId: null,
        channels: [channel],
        viewerPermissions: {
          canReply: true,
          canCreateMessage: true,
          canReact: true,
        },
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
            likedByViewer: true,
            likeCount: 1,
            title: "Bienvenida",
          },
        ],
      })),
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
    expect(messageRoundReadRepository.listByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("returns a read-only round for muted members", async () => {
    const execute = listTribeRound({
      messageRoundReadRepository: {
        listByTribeSlug: jest.fn(async () => ({
          activeChannelId: null,
          channels: [channel],
          viewerPermissions: {
            canReply: false,
            canCreateMessage: false,
            canReact: false,
          },
          messages: [],
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
});
