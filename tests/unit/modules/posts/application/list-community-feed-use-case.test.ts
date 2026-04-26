import { listCommunityFeed } from "@/src/modules/posts/application/use-cases/list-community-feed-use-case";

describe("listCommunityFeed", () => {
  it("returns posts and enables participation for active members", async () => {
    const postFeedReadRepository = {
      listByCommunitySlug: jest.fn(async () => ({
        viewerPermissions: {
          canComment: true,
          canCreatePost: true,
          canReact: true,
        },
        posts: [
          {
            id: "post-1",
            author: {
              id: "owner-1",
              name: "Ada Lovelace",
              role: "owner" as const,
              avatarFallback: "AL",
              image: null,
            },
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
    const execute = listCommunityFeed({ postFeedReadRepository });

    await expect(
      execute({
        communitySlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toEqual({
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
    expect(postFeedReadRepository.listByCommunitySlug).toHaveBeenCalledWith({
      communitySlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("returns a read-only feed for muted members", async () => {
    const execute = listCommunityFeed({
      postFeedReadRepository: {
        listByCommunitySlug: jest.fn(async () => ({
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
        communitySlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toEqual({
      viewerPermissions: {
        canComment: false,
        canCreatePost: false,
        canReact: false,
      },
      posts: [],
    });
  });
});
