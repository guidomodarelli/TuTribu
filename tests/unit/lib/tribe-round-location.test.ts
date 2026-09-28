import { describe, expect, it } from "vitest";

import {
  buildTribeRoundPageHref,
  isSameTribeRoundLocation,
  readTribeRoundLocation,
} from "@/lib/messages/tribe-round-location";

describe("buildTribeRoundPageHref", () => {
  it("links the first page of every channel to the bare tribe path", () => {
    expect(
      buildTribeRoundPageHref({ channelSlug: null, page: 1, tribeSlug: "matematica-pro" })
    ).toBe("/matematica-pro");
  });

  it("keeps the channel and writes the page only after the first one", () => {
    expect(
      buildTribeRoundPageHref({ channelSlug: "ronda", page: 1, tribeSlug: "matematica-pro" })
    ).toBe("/matematica-pro?channel=ronda");
    expect(
      buildTribeRoundPageHref({ channelSlug: "ronda", page: 3, tribeSlug: "matematica-pro" })
    ).toBe("/matematica-pro?channel=ronda&page=3");
  });
});

describe("readTribeRoundLocation", () => {
  it("reads the channel and page of a deep link", () => {
    expect(readTribeRoundLocation("?channel=ronda&page=2")).toEqual({
      channelSlug: "ronda",
      page: 2,
    });
  });

  it("falls back to the first page of every channel like the tribe page does", () => {
    expect(readTribeRoundLocation("")).toEqual({ channelSlug: null, page: 1 });
    expect(readTribeRoundLocation("?channel=%20&page=-4")).toEqual({
      channelSlug: null,
      page: 1,
    });
    expect(readTribeRoundLocation("?page=2.5")).toEqual({ channelSlug: null, page: 1 });
  });
});

describe("isSameTribeRoundLocation", () => {
  it("compares channel and page", () => {
    expect(
      isSameTribeRoundLocation({ channelSlug: "ronda", page: 2 }, { channelSlug: "ronda", page: 2 })
    ).toBe(true);
    expect(
      isSameTribeRoundLocation({ channelSlug: "ronda", page: 2 }, { channelSlug: null, page: 2 })
    ).toBe(false);
  });
});
