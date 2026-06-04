import { listMessageLikers } from "@/src/modules/messages/application/use-cases/list-tribe-round-use-case";

describe("listMessageLikers", () => {
  function buildRepository(
    listLikersByMessageId: jest.Mock
  ) {
    return {
      listByTribeSlug: jest.fn(),
      listLikersByMessageId,
      listRepliesByMessageId: jest.fn(),
      listSharedDataByTribeSlug: jest.fn(),
      listViewerStateByTribeSlug: jest.fn(),
    };
  }

  it("trims the tribe slug before delegating to the repository", async () => {
    const listLikersByMessageId = jest.fn(async () => ({
      status: "found" as const,
      totalCount: 1,
      likers: [
        {
          avatarFallback: "GH",
          id: "member-1",
          image: null,
          name: "Grace Hopper",
          role: "tribemate" as const,
        },
      ],
    }));
    const execute = listMessageLikers({
      messageRoundReadRepository: buildRepository(listLikersByMessageId),
    });

    const result = await execute({
      messageId: "message-1",
      tribeSlug: "  matematica-pro  ",
      viewerId: "member-1",
    });

    expect(result).toEqual({
      status: "found",
      totalCount: 1,
      likers: [
        {
          avatarFallback: "GH",
          id: "member-1",
          image: null,
          name: "Grace Hopper",
          role: "tribemate",
        },
      ],
    });
    expect(listLikersByMessageId).toHaveBeenCalledWith({
      messageId: "message-1",
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("propagates a forbidden result without exposing likers", async () => {
    const listLikersByMessageId = jest.fn(async () => ({
      status: "forbidden" as const,
    }));
    const execute = listMessageLikers({
      messageRoundReadRepository: buildRepository(listLikersByMessageId),
    });

    await expect(
      execute({
        messageId: "message-1",
        tribeSlug: "matematica-pro",
        viewerId: "outsider-1",
      })
    ).resolves.toEqual({ status: "forbidden" });
  });
});
