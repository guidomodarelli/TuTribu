import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { TRIBE_EVENT_CALENDAR_FEED_TOKEN } from "@/src/modules/events/constants/tribe-event-calendar-feed";
import { calendarFeedTokenCodec } from "@/src/modules/events/infrastructure/calendar/calendar-feed-token-codec";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

describe("calendarFeedTokenCodec", () => {
  it("generates 32 random bytes as base64url and returns its SHA-256 hex digest", () => {
    const { token, tokenHash } = calendarFeedTokenCodec.generate();

    expect(token).toHaveLength(TRIBE_EVENT_CALENDAR_FEED_TOKEN.encodedLength);
    expect(token).toMatch(BASE64URL_PATTERN);
    expect(Buffer.from(token, "base64url")).toHaveLength(TRIBE_EVENT_CALENDAR_FEED_TOKEN.byteLength);
    expect(tokenHash).toMatch(SHA256_HEX_PATTERN);
    expect(tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(calendarFeedTokenCodec.hash(token)).toBe(tokenHash);
  });

  it("never repeats a token", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => calendarFeedTokenCodec.generate().token));

    expect(tokens.size).toBe(50);
  });

  it("compares digests in constant time and rejects different or malformed ones", () => {
    const { tokenHash } = calendarFeedTokenCodec.generate();

    expect(calendarFeedTokenCodec.matchesHash(tokenHash, tokenHash)).toBe(true);
    expect(calendarFeedTokenCodec.matchesHash(tokenHash, "0".repeat(64))).toBe(false);
    expect(calendarFeedTokenCodec.matchesHash(tokenHash, "abc")).toBe(false);
    expect(calendarFeedTokenCodec.matchesHash("zz".repeat(32), "zz".repeat(32))).toBe(false);
  });
});
