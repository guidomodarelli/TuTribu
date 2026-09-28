// @vitest-environment node
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { GET } from "@/app/api/tribes/[slug]/messages/route";
import { scheduleMissingVideoThumbnailBackfill } from "@/src/modules/messages/infrastructure/composition/video-thumbnail-backfill";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = vi.fn();
const getTribePageAccess = vi.fn();
const listTribeRound = vi.fn();
const logError = vi.fn();
const logWarn = vi.fn();

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

// The backfill schedules `after()` work over a dedicated pg pool; the route
// only has to hand it the visible message ids.
vi.mock("@/src/modules/messages/infrastructure/composition/video-thumbnail-backfill", () => ({
  scheduleMissingVideoThumbnailBackfill: vi.fn(),
}));

vi.mock("@/src/modules/shared/infrastructure/observability/server-logger", () => ({
  createServerLogger: vi.fn(() => ({ error: logError, info: vi.fn(), warn: logWarn })),
}));

const BASE_URL = "https://tutribu.example.com/api/tribes/matematica-pro/messages";
const VIEWER_ID = "member-1";
const UNEXPECTED_ROUND_MESSAGE = "No pudimos cargar los mensajes. Intentá de nuevo.";

const channel = {
  accessScope: "tribemates" as const,
  emoji: "🔥",
  id: "channel-ronda",
  name: "Ronda",
  slug: "ronda",
  sortOrder: 20,
};

const roundMessage = {
  author: {
    avatarFallback: "AL",
    id: "leader-1",
    image: null,
    name: "Ada Lovelace",
    role: "leader" as const,
  },
  channel,
  content: "Bienvenida a la tribu",
  createdAt: "2026-04-26T12:00:00.000Z",
  hasLoadedReplies: true,
  id: "message-1",
  likeCount: 2,
  likedByViewer: false,
  media: [
    {
      externalId: "abc123",
      id: "video-1",
      kind: "video" as const,
      provider: "vimeo" as const,
      sortOrder: 0,
      thumbnailResolved: false,
      thumbnailUrl: null,
    },
  ],
  permissions: { canDelete: false, canEdit: false },
  pinnedAt: null,
  poll: null,
  replies: [],
  replyCount: 0,
  title: "Anuncio inicial",
};

const roundPage = {
  activeChannelId: channel.id,
  channels: [channel],
  messages: [roundMessage],
  pagination: {
    currentPage: 2,
    hasNextPage: false,
    hasPreviousPage: true,
    pageSize: 15,
  },
  viewerPermissions: {
    canCreateMessage: true,
    canReact: true,
    canReply: true,
  },
};

function routeContext(slug = "matematica-pro") {
  return { params: Promise.resolve({ slug }) };
}

describe("GET /api/tribes/[slug]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedMember.mockResolvedValue({ id: VIEWER_ID, name: "Grace Hopper" });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: { slug: "matematica-pro" },
    });
    listTribeRound.mockResolvedValue(roundPage);
    (createRequestModules as Mock).mockResolvedValue({
      auth: { useCases: { getAuthenticatedMember } },
      messages: { useCases: { listTribeRound } },
      tribes: { useCases: { getTribePageAccess } },
    });
  });

  it("requires a session before reading the round", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    const response = await GET(new Request(`${BASE_URL}?page=2`), routeContext());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Iniciá sesión para ver los mensajes.",
    });
    expect(getTribePageAccess).not.toHaveBeenCalled();
    expect(listTribeRound).not.toHaveBeenCalled();
  });

  it.each([
    ["a zero page", "?page=0"],
    ["a non numeric page", "?page=dos"],
    ["a decimal page", "?page=1.5"],
    ["a repeated page", "?page=1&page=2"],
    ["a malformed channel", "?channel=Canal%20Raro"],
    ["an empty channel", "?channel="],
  ])("rejects %s at the boundary without reading the round", async (_label, query) => {
    const response = await GET(new Request(`${BASE_URL}${query}`), routeContext());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "No pudimos cargar esa página de mensajes.",
    });
    expect(getTribePageAccess).not.toHaveBeenCalled();
    expect(listTribeRound).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ part: "query" }) })
    );
    expect(JSON.stringify(logWarn.mock.calls)).not.toContain("Canal Raro");
  });

  it("rejects a malformed tribe slug as an unknown tribe", async () => {
    const response = await GET(new Request(BASE_URL), routeContext("Tribu_Rara"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "No pudimos encontrar la tribu." });
    expect(listTribeRound).not.toHaveBeenCalled();
  });

  it("hides the round from viewers who cannot open the tribe page", async () => {
    getTribePageAccess.mockResolvedValue({
      reason: "not_found_or_not_visible",
      status: "hidden",
    });

    const response = await GET(new Request(`${BASE_URL}?channel=ronda`), routeContext());

    expect(getTribePageAccess).toHaveBeenCalledWith({
      isAuthenticated: true,
      slug: "matematica-pro",
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: "No pudimos encontrar la tribu." });
    expect(listTribeRound).not.toHaveBeenCalled();
  });

  it("serves the requested channel page through its allowlist without caching", async () => {
    listTribeRound.mockResolvedValue({
      ...roundPage,
      internalCursor: "cursor-secret",
      messages: [{ ...roundMessage, tribeId: "tribe-internal-id" }],
    });

    const response = await GET(new Request(`${BASE_URL}?channel=ronda&page=2`), routeContext());

    expect(listTribeRound).toHaveBeenCalledWith({
      channelSlug: "ronda",
      page: 2,
      tribeSlug: "matematica-pro",
      viewerId: VIEWER_ID,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ round: roundPage });
  });

  it("reads the first page of every channel when the query is empty", async () => {
    await GET(new Request(BASE_URL), routeContext());

    expect(listTribeRound).toHaveBeenCalledWith({
      channelSlug: null,
      page: 1,
      tribeSlug: "matematica-pro",
      viewerId: VIEWER_ID,
    });
  });

  it("schedules the thumbnail backfill for the videos of the served page", async () => {
    await GET(new Request(`${BASE_URL}?page=2`), routeContext());

    expect(scheduleMissingVideoThumbnailBackfill).toHaveBeenCalledWith({
      messageIds: ["message-1"],
      tribeSlug: "matematica-pro",
      viewerId: VIEWER_ID,
    });
  });

  it("answers a safe 500 and logs the context when the round cannot be read", async () => {
    listTribeRound.mockRejectedValue(new Error("connection terminated: pg internals"));

    const response = await GET(new Request(`${BASE_URL}?channel=ronda&page=2`), routeContext());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ message: UNEXPECTED_ROUND_MESSAGE });
    expect(JSON.stringify(body)).not.toContain("pg internals");
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          channelSlug: "ronda",
          page: 2,
          tribeSlug: "matematica-pro",
          viewerId: VIEWER_ID,
        }),
      })
    );
  });

  it("answers a safe 500 when the tribe access cannot be resolved", async () => {
    getTribePageAccess.mockRejectedValue(new Error("tribes lookup failed"));

    const response = await GET(new Request(BASE_URL), routeContext());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ message: UNEXPECTED_ROUND_MESSAGE });
    expect(listTribeRound).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
  });

  it("answers a safe 500 when the round DTO is unusable and logs only issue paths", async () => {
    listTribeRound.mockResolvedValue({
      ...roundPage,
      messages: [{ ...roundMessage, createdAt: "ayer", title: 42 }],
    });

    const response = await GET(new Request(BASE_URL), routeContext());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ message: UNEXPECTED_ROUND_MESSAGE });
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          reason: "public_dto_rejected",
          viewerId: VIEWER_ID,
        }),
      })
    );
    expect(JSON.stringify(logError.mock.calls)).not.toContain("ayer");
  });
});
