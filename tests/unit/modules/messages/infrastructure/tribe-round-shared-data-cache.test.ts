const mockListSharedDataByTribeSlug = jest.fn();
const mockWithRequestContext = jest.fn();

jest.mock("server-only", () => ({}));

jest.mock("next/cache", () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/database/server-database-client",
  () => ({
    createServerDatabaseClient: jest.fn(),
  })
);

jest.mock(
  "@/src/modules/messages/infrastructure/repositories/postgres-message-round-repository",
  () => ({
    PostgresMessageRoundRepository: jest.fn(),
  })
);

import { cacheLife, cacheTag } from "next/cache";
import { createServerDatabaseClient } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { PostgresMessageRoundRepository } from "@/src/modules/messages/infrastructure/repositories/postgres-message-round-repository";
import { listCachedTribeRoundSharedData } from "@/src/modules/messages/infrastructure/cache/tribe-round-shared-data-cache";

describe("listCachedTribeRoundSharedData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createServerDatabaseClient as jest.Mock).mockResolvedValue({
      withRequestContext: mockWithRequestContext,
    });
    (PostgresMessageRoundRepository as jest.Mock).mockImplementation(() => ({
      listSharedDataByTribeSlug: mockListSharedDataByTribeSlug,
    }));
    mockWithRequestContext.mockImplementation(async (_context, callback) =>
      callback({ execute: jest.fn() })
    );
    mockListSharedDataByTribeSlug.mockResolvedValue({
      activeChannelId: "channel-ronda",
      channels: [],
      messages: [],
      pagination: {
        currentPage: 3,
        hasNextPage: false,
        hasPreviousPage: true,
        pageSize: 15,
      },
    });
  });

  it("forwards the active channel and page to the shared data repository", async () => {
    await expect(
      listCachedTribeRoundSharedData({
        channelSlug: "ronda",
        page: 3,
        tribeSlug: "matematica-pro",
        viewerId: "member-1",
      })
    ).resolves.toEqual(
      expect.objectContaining({
        activeChannelId: "channel-ronda",
      })
    );

    expect(mockListSharedDataByTribeSlug).toHaveBeenCalledWith({
      channelSlug: "ronda",
      page: 3,
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
    expect(mockWithRequestContext).not.toHaveBeenCalled();
    expect(cacheLife).toHaveBeenCalled();
    expect(cacheTag).toHaveBeenCalled();
  });
});
