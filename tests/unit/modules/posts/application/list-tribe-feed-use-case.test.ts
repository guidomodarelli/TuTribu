import { listTribeFeed } from "@/src/modules/posts/application/use-cases/list-tribe-feed-use-case";

describe("listTribeFeed", () => {
  const channel = {
    accessScope: "tribemates" as const,
    emoji: "💬",
    id: "channel-general",
    name: "General",
    slug: "general",
    sortOrder: 20,
  };

  it("returns posts and enables participation for active members", async () => {
    const postFeedReadRepository = {
      listByTribeSlug: jest.fn(async () => ({
        activeChannelId: null,
        channels: [channel],
        viewerPermissions: {
          canComment: true,
          canCreatePost: true,
          canReact: true,
        },
        posts: [
          {
            id: "post-1",
            author: {
              id: "leader-1",
              name: "Ada Lovelace",
              role: "leader" as const,
              avatarFallback: "AL",
              image: null,
            },
            channel,
            comments: [],
            content: "Bienvenida al grupo",
            createdAt: "2026-04-26T12:00:00.000Z",
            likedByViewer: true,
            likeCount: 1,
            title: "Bienvenida",
          },
        ],
      })),
    };
    const execute = listTribeFeed({ postFeedReadRepository });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toEqual({
      activeChannelId: null,
      channels: [channel],
      viewerPermissions: {
        canComment: true,
        canCreatePost: true,
        canReact: true,
      },
      posts: [
        expect.objectContaining({
          id: "post-1",
          likedByViewer: true,
          likeCount: 1,
        }),
      ],
    });
    expect(postFeedReadRepository.listByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("returns a read-only feed for muted members", async () => {
    const execute = listTribeFeed({
      postFeedReadRepository: {
        listByTribeSlug: jest.fn(async () => ({
          activeChannelId: null,
          channels: [channel],
          viewerPermissions: {
            canComment: false,
            canCreatePost: false,
            canReact: false,
          },
          posts: [],
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
        canComment: false,
        canCreatePost: false,
        canReact: false,
      },
      posts: [],
    });
  });
});
