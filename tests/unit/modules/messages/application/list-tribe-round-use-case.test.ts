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

  function createDeferredResult<Result>() {
    let resolveDeferredResult!: (result: Result) => void;
    const promise = new Promise<Result>((resolve) => {
      resolveDeferredResult = resolve;
    });

    return {
      promise,
      resolve: resolveDeferredResult,
    };
  }

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
      pagination: {
        currentPage: 2,
        hasNextPage: true,
        hasPreviousPage: true,
        pageSize: 15,
      },
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
      listRepliesByMessageId: jest.fn(),
      listSharedDataByTribeSlug,
      listViewerStateByTribeSlug,
    };
    const execute = listTribeRound({ messageRoundReadRepository });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        channelSlug: "ronda",
        page: 2,
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
          hasLoadedReplies: true,
          likedByViewer: true,
          likeCount: 1,
          replies: [],
        }),
      ],
      pagination: {
        currentPage: 2,
        hasNextPage: true,
        hasPreviousPage: true,
        pageSize: 15,
      },
    });
    expect(listSharedDataByTribeSlug).toHaveBeenCalledWith({
      channelSlug: "ronda",
      page: 2,
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
    expect(listViewerStateByTribeSlug).toHaveBeenCalledWith({
      channelSlug: "ronda",
      page: 2,
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
    expect(messageRoundReadRepository.listByTribeSlug).not.toHaveBeenCalled();
  });

  it("hides open poll results until the viewer has voted", async () => {
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
          content: "Elegimos tema",
          createdAt: "2026-04-26T12:00:00.000Z",
          likeCount: 0,
          poll: {
            allowMultipleVotes: false,
            id: "poll-1",
            options: [
              {
                id: "option-1",
                percentage: 75,
                selectedByViewer: false,
                text: "Algebra",
                voteCount: 3,
              },
              {
                id: "option-2",
                percentage: 25,
                selectedByViewer: false,
                text: "Geometria",
                voteCount: 1,
              },
            ],
            question: "Que repasamos?",
            totalVoteCount: 4,
            viewerHasVoted: false,
          },
          title: "Encuesta",
        },
      ],
      pagination: {
        currentPage: 1,
        hasNextPage: false,
        hasPreviousPage: false,
        pageSize: 15,
      },
    }));
    const execute = listTribeRound({
      messageRoundReadRepository: {
        listByTribeSlug: jest.fn(),
        listRepliesByMessageId: jest.fn(),
        listSharedDataByTribeSlug,
        listViewerStateByTribeSlug: jest.fn(async () => ({
          likedMessageIds: [],
          selectedPollOptionIds: [],
          viewerId: "member-1",
          viewerPermissions: {
            canReply: true,
            canCreateMessage: true,
            canReact: true,
          },
        })),
      },
    });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toMatchObject({
      messages: [
        {
          poll: {
            totalVoteCount: 4,
            viewerHasVoted: false,
            options: [
              {
                id: "option-1",
                percentage: 0,
                selectedByViewer: false,
                voteCount: 0,
              },
              {
                id: "option-2",
                percentage: 0,
                selectedByViewer: false,
                voteCount: 0,
              },
            ],
          },
        },
      ],
    });
  });

  it("returns a read-only round for muted members", async () => {
    const execute = listTribeRound({
      messageRoundReadRepository: {
        listByTribeSlug: jest.fn(),
        listRepliesByMessageId: jest.fn(),
        listSharedDataByTribeSlug: jest.fn(async () => ({
          activeChannelId: null,
          channels: [channel],
          messages: [],
          pagination: {
            currentPage: 1,
            hasNextPage: false,
            hasPreviousPage: false,
            pageSize: 15,
          },
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
      pagination: {
        currentPage: 1,
        hasNextPage: false,
        hasPreviousPage: false,
        pageSize: 15,
      },
    });
  });

  it("exposes delete permission on the message instead of poll management permissions", async () => {
    const execute = listTribeRound({
      messageRoundReadRepository: {
        listByTribeSlug: jest.fn(),
        listRepliesByMessageId: jest.fn(),
        listSharedDataByTribeSlug: jest.fn(async () => ({
          activeChannelId: null,
          channels: [channel],
          messages: [
            {
              id: "message-1",
              author: {
                id: "author-1",
                name: "Ada Lovelace",
                role: "tribemate" as const,
                avatarFallback: "AL",
                image: null,
              },
              channel,
              content: "Choose a topic",
              createdAt: "2026-04-26T12:00:00.000Z",
              likeCount: 0,
              poll: {
                allowMultipleVotes: false,
                id: "poll-1",
                options: [
                  {
                    id: "option-1",
                    percentage: 0,
                    selectedByViewer: false,
                    text: "Algebra",
                    voteCount: 0,
                  },
                  {
                    id: "option-2",
                    percentage: 0,
                    selectedByViewer: false,
                    text: "Geometry",
                    voteCount: 0,
                  },
                ],
                question: "What should we practice?",
                totalVoteCount: 0,
                viewerHasVoted: false,
              },
              title: "Poll",
            },
          ],
          pagination: {
            currentPage: 1,
            hasNextPage: false,
            hasPreviousPage: false,
            pageSize: 15,
          },
        })),
        listViewerStateByTribeSlug: jest.fn(async () => ({
          likedMessageIds: [],
          selectedPollOptionIds: [],
          viewerId: "author-1",
          viewerPermissions: {
            canReply: true,
            canCreateMessage: true,
            canReact: true,
          },
        })),
      },
    });

    await expect(
      execute({
        tribeSlug: "matematica-pro",
        viewerId: "author-1",
      })
    ).resolves.toMatchObject({
      messages: [
        {
          permissions: {
            canDelete: true,
          },
          poll: expect.not.objectContaining({
            permissions: expect.anything(),
          }),
        },
      ],
    });
  });

  it("blocks own message deletion when the viewer has read-only permissions", async () => {
    const execute = listTribeRound({
      messageRoundReadRepository: {
        listByTribeSlug: jest.fn(),
        listRepliesByMessageId: jest.fn(),
        listSharedDataByTribeSlug: jest.fn(async () => ({
          activeChannelId: null,
          channels: [channel],
          messages: [
            {
              id: "message-1",
              author: {
                id: "author-1",
                name: "Ada Lovelace",
                role: "tribemate" as const,
                avatarFallback: "AL",
                image: null,
              },
              channel,
              content: "Read-only update",
              createdAt: "2026-04-26T12:00:00.000Z",
              likeCount: 0,
              title: "Read-only",
            },
          ],
          pagination: {
            currentPage: 1,
            hasNextPage: false,
            hasPreviousPage: false,
            pageSize: 15,
          },
        })),
        listViewerStateByTribeSlug: jest.fn(async () => ({
          likedMessageIds: [],
          selectedPollOptionIds: [],
          viewerId: "author-1",
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
        viewerId: "author-1",
      })
    ).resolves.toMatchObject({
      messages: [
        {
          permissions: {
            canDelete: false,
          },
        },
      ],
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
      pagination: {
        currentPage: 1,
        hasNextPage: false,
        hasPreviousPage: false,
        pageSize: 15,
      },
    }));
    const execute = listTribeRound({
      listCachedTribeRoundSharedData,
      messageRoundReadRepository: {
        listByTribeSlug: jest.fn(),
        listRepliesByMessageId: jest.fn(),
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
      pagination: {
        currentPage: 1,
        hasNextPage: false,
        hasPreviousPage: false,
        pageSize: 15,
      },
    });

    expect(listCachedTribeRoundSharedData).toHaveBeenCalledWith({
      channelSlug: null,
      page: 1,
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
    expect(listSharedDataByTribeSlug).not.toHaveBeenCalled();
    expect(listViewerStateByTribeSlug).toHaveBeenCalledWith({
      channelSlug: null,
      page: 1,
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("reads viewer state after shared round data to reduce concurrent database checkouts", async () => {
    const sharedRoundData = {
      activeChannelId: null,
      channels: [channel],
      messages: [],
      pagination: {
        currentPage: 1,
        hasNextPage: false,
        hasPreviousPage: false,
        pageSize: 15,
      },
    };
    const sharedData = createDeferredResult(sharedRoundData);
    const listSharedDataByTribeSlug = jest.fn(() => sharedData.promise);
    const listViewerStateByTribeSlug = jest.fn(async () => ({
      likedMessageIds: [],
      selectedPollOptionIds: [],
      viewerId: "member-1",
      viewerPermissions: {
        canReply: true,
        canCreateMessage: true,
        canReact: true,
      },
    }));
    const execute = listTribeRound({
      messageRoundReadRepository: {
        listByTribeSlug: jest.fn(),
        listRepliesByMessageId: jest.fn(),
        listSharedDataByTribeSlug,
        listViewerStateByTribeSlug,
      },
    });
    const result = execute({
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });

    await Promise.resolve();

    expect(listSharedDataByTribeSlug).toHaveBeenCalledTimes(1);
    expect(listViewerStateByTribeSlug).not.toHaveBeenCalled();

    sharedData.resolve(sharedRoundData);

    await expect(result).resolves.toMatchObject({
      channels: [channel],
      messages: [],
    });
    expect(listViewerStateByTribeSlug).toHaveBeenCalledTimes(1);
  });
});
