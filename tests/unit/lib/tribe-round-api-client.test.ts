import { beforeEach, describe, expect, it, type Mock } from "vitest";

import { fetchTribeRoundPageRequest } from "@/lib/messages/tribe-round-api-client";

const channel = {
  accessScope: "tribemates",
  emoji: "🔥",
  id: "channel-ronda",
  name: "Ronda",
  slug: "ronda",
  sortOrder: 20,
};

const round = {
  activeChannelId: "channel-ronda",
  channels: [channel],
  messages: [
    {
      author: {
        avatarFallback: "AL",
        id: "leader-1",
        image: null,
        name: "Ada Lovelace",
        role: "leader",
      },
      channel,
      content: "Bienvenida a la tribu",
      createdAt: "2026-04-26T12:00:00.000Z",
      id: "message-1",
      likeCount: 2,
      likedByViewer: false,
      replies: [],
      replyCount: 0,
      title: "Anuncio inicial",
    },
  ],
  pagination: { currentPage: 2, hasNextPage: false, hasPreviousPage: true, pageSize: 15 },
  viewerPermissions: { canCreateMessage: true, canReact: true, canReply: true },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("fetchTribeRoundPageRequest", () => {
  beforeEach(() => {
    (global.fetch as Mock).mockReset();
  });

  it("requests the channel page without caching and returns the validated round", async () => {
    (global.fetch as Mock).mockResolvedValue(jsonResponse({ round }));
    const abortController = new AbortController();

    const result = await fetchTribeRoundPageRequest({
      channelSlug: "ronda",
      page: 2,
      signal: abortController.signal,
      tribeSlug: "matematica-pro",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/messages?channel=ronda&page=2",
      expect.objectContaining({ cache: "no-store", signal: abortController.signal })
    );
    expect(result).toEqual({ isSuccess: true, round });
  });

  it("omits the defaults from the query of the first page of every channel", async () => {
    (global.fetch as Mock).mockResolvedValue(jsonResponse({ round }));

    await fetchTribeRoundPageRequest({ channelSlug: null, page: 1, tribeSlug: "matematica-pro" });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/messages",
      expect.any(Object)
    );
  });

  it("rejects a success body that does not match the public round contract", async () => {
    (global.fetch as Mock).mockResolvedValue(
      jsonResponse({ round: { ...round, messages: [{ id: "message-1" }] } })
    );

    const result = await fetchTribeRoundPageRequest({
      channelSlug: null,
      page: 1,
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ isSuccess: false, message: null });
  });

  it("surfaces the safe message of an error response", async () => {
    (global.fetch as Mock).mockResolvedValue(
      jsonResponse({ message: "No pudimos encontrar la tribu." }, 404)
    );

    const result = await fetchTribeRoundPageRequest({
      channelSlug: null,
      page: 1,
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ isSuccess: false, message: "No pudimos encontrar la tribu." });
  });

  it("ignores an error body without a usable message", async () => {
    (global.fetch as Mock).mockResolvedValue(new Response("<html>502</html>", { status: 502 }));

    const result = await fetchTribeRoundPageRequest({
      channelSlug: null,
      page: 1,
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({ isSuccess: false, message: null });
  });
});
