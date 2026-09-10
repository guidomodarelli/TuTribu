import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
const mockListSharedDataByTribeSlug = vi.fn();
const mockWithRequestContext = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

vi.mock(
  "@/src/modules/shared/infrastructure/database/server-database-client",
  () => ({
    createServerDatabaseClient: vi.fn(),
  })
);

vi.mock(
  "@/src/modules/messages/infrastructure/repositories/postgres-message-round-repository",
  () => ({
    PostgresMessageRoundRepository: vi.fn(),
  })
);

import { cacheLife, cacheTag } from "next/cache";
import { createServerDatabaseClient } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { PostgresMessageRoundRepository } from "@/src/modules/messages/infrastructure/repositories/postgres-message-round-repository";
import { listCachedTribeRoundSharedData } from "@/src/modules/messages/infrastructure/cache/tribe-round-shared-data-cache";

describe("listCachedTribeRoundSharedData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createServerDatabaseClient as Mock).mockResolvedValue({
      withRequestContext: mockWithRequestContext,
    });
    (PostgresMessageRoundRepository as Mock).mockImplementation(function () { return ({
      listSharedDataByTribeSlug: mockListSharedDataByTribeSlug,
    }); });
    mockWithRequestContext.mockImplementation(async function (_context, callback) { return callback({ execute: vi.fn() }); }
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
