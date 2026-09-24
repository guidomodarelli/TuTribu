import { describe, expect, it, vi } from "vitest";

import {
  getTribeEventCalendarFeed,
  getTribeEventCalendarFeedSubscription,
  issueTribeEventCalendarFeedToken,
  revokeTribeEventCalendarFeedToken,
} from "@/src/modules/events/application/use-cases/tribe-event-calendar-feed-use-cases";
import {
  TRIBE_EVENT_CALENDAR_FEED_REFRESH,
  TRIBE_EVENT_CALENDAR_FEED_WINDOW,
} from "@/src/modules/events/constants/tribe-event-calendar-feed";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type { TribeEvent } from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventCalendarFeedTokenOwner } from "@/src/modules/events/domain/entities/tribe-event-calendar-feed";
import type {
  TribeEventCalendarFeedReader,
  TribeEventCalendarFeedTokenCodec,
  TribeEventCalendarFeedTokenRepository,
} from "@/src/modules/events/domain/repositories/tribe-event-calendar-feed-repository";

const TRIBE_SLUG = "matematica-pro";
const TOKEN = "a".repeat(43);
const TOKEN_HASH = "b".repeat(64);
const NOW = new Date("2026-05-10T12:00:00.000Z");
const MILLISECONDS_PER_DAY = 86_400_000;
const HOUR_MILLISECONDS = 3_600_000;
const WEEK_MILLISECONDS = 7 * MILLISECONDS_PER_DAY;

const owner: TribeEventCalendarFeedTokenOwner = {
  tokenHash: TOKEN_HASH,
  tokenId: "5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e",
  tribeId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  userId: "user-ana",
};

function createSeries(overrides: Partial<TribeEvent> = {}): TribeEvent {
  return {
    capacity: null,
    description: null,
    endsAt: "2026-05-07T22:00:00.000Z",
    eventType: "workshop",
    id: "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f",
    meetingUrl: null,
    recurrenceFrequency: "weekly",
    recurrenceUntil: null,
    startsAt: "2026-05-07T21:00:00.000Z",
    title: "Taller semanal",
    ...overrides,
  };
}

function createCodec(overrides: Partial<TribeEventCalendarFeedTokenCodec> = {}) {
  return {
    generate: vi.fn(() => ({ token: TOKEN, tokenHash: TOKEN_HASH })),
    hash: vi.fn(() => TOKEN_HASH),
    matchesHash: vi.fn((candidate: string, stored: string) => candidate === stored),
    ...overrides,
  } satisfies TribeEventCalendarFeedTokenCodec;
}

function createReader(overrides: Partial<TribeEventCalendarFeedReader> = {}) {
  return {
    readAsOwner: vi.fn(async () => ({ exceptions: [], series: [], tribeName: "Matemática Pro" })),
    resolveToken: vi.fn(async () => owner),
    ...overrides,
  } satisfies TribeEventCalendarFeedReader;
}

function createTokenRepository(overrides: Partial<TribeEventCalendarFeedTokenRepository> = {}) {
  return {
    findActive: vi.fn(),
    issue: vi.fn(),
    revoke: vi.fn(),
    ...overrides,
  } satisfies TribeEventCalendarFeedTokenRepository;
}

describe("issueTribeEventCalendarFeedToken", () => {
  it("stores only the hash and returns the plain token once", async () => {
    const tribeEventCalendarFeedTokenRepository = createTokenRepository({
      issue: vi.fn(async () => ({
        status: TRIBE_EVENT_MUTATION_STATUS.feedTokenIssued,
        subscription: { createdAt: NOW.toISOString(), lastUsedAt: null },
      })),
    });
    const execute = issueTribeEventCalendarFeedToken({
      tribeEventCalendarFeedTokenCodec: createCodec(),
      tribeEventCalendarFeedTokenRepository,
    });

    const result = await execute({ tribeSlug: TRIBE_SLUG });

    expect(tribeEventCalendarFeedTokenRepository.issue).toHaveBeenCalledWith({
      tokenHash: TOKEN_HASH,
      tribeSlug: TRIBE_SLUG,
    });
    expect(JSON.stringify(vi.mocked(tribeEventCalendarFeedTokenRepository.issue).mock.calls)).not.toContain(TOKEN);
    expect(result).toEqual({
      status: TRIBE_EVENT_MUTATION_STATUS.feedTokenIssued,
      subscription: { createdAt: NOW.toISOString(), lastUsedAt: null },
      token: TOKEN,
    });
  });

  it("never returns a token when the member cannot read the tribe", async () => {
    const execute = issueTribeEventCalendarFeedToken({
      tribeEventCalendarFeedTokenCodec: createCodec(),
      tribeEventCalendarFeedTokenRepository: createTokenRepository({
        issue: vi.fn(async () => ({ status: TRIBE_EVENT_MUTATION_STATUS.forbidden })),
      }),
    });

    await expect(execute({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      status: TRIBE_EVENT_MUTATION_STATUS.forbidden,
    });
  });
});

describe("getTribeEventCalendarFeedSubscription and revokeTribeEventCalendarFeedToken", () => {
  it("passes the lookup and the idempotent revoke through the port", async () => {
    const repository = createTokenRepository({
      findActive: vi.fn(async () => ({
        status: TRIBE_EVENT_MUTATION_STATUS.found,
        subscription: null,
      })),
      revoke: vi.fn(async () => ({ status: TRIBE_EVENT_MUTATION_STATUS.feedTokenRevoked })),
    });

    await expect(
      getTribeEventCalendarFeedSubscription({ tribeEventCalendarFeedTokenRepository: repository })({
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.found, subscription: null });
    await expect(
      revokeTribeEventCalendarFeedToken({ tribeEventCalendarFeedTokenRepository: repository })({
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.feedTokenRevoked });
  });
});

describe("getTribeEventCalendarFeed", () => {
  function createDependencies(reader = createReader(), codec = createCodec()) {
    return {
      now: () => NOW,
      tribeEventCalendarFeedReader: reader,
      tribeEventCalendarFeedTokenCodec: codec,
    };
  }

  it("resolves the token by its hash and reads as its owner inside the bounded window", async () => {
    const reader = createReader();
    const execute = getTribeEventCalendarFeed(createDependencies(reader));

    await execute({ eventTypes: [], token: TOKEN, tribeSlug: TRIBE_SLUG });

    expect(reader.resolveToken).toHaveBeenCalledWith(TOKEN_HASH);
    expect(reader.readAsOwner).toHaveBeenCalledWith({
      eventTypes: [],
      lastUsedRefreshMinutes: TRIBE_EVENT_CALENDAR_FEED_REFRESH.lastUsedRefreshMinutes,
      maxExceptions: TRIBE_EVENT_CALENDAR_FEED_WINDOW.maxExceptions,
      maxSeries: TRIBE_EVENT_CALENDAR_FEED_WINDOW.maxComponents,
      owner,
      rangeEnd: new Date(
        NOW.getTime() + TRIBE_EVENT_CALENDAR_FEED_WINDOW.futureWindowDays * MILLISECONDS_PER_DAY
      ).toISOString(),
      rangeStart: new Date(
        NOW.getTime() - TRIBE_EVENT_CALENDAR_FEED_WINDOW.pastWindowDays * MILLISECONDS_PER_DAY
      ).toISOString(),
      tribeSlug: TRIBE_SLUG,
    });
  });

  it("answers not found for an unknown or revoked token without reading the tribe", async () => {
    const reader = createReader({ resolveToken: vi.fn(async () => null) });

    const result = await getTribeEventCalendarFeed(createDependencies(reader))({
      eventTypes: [],
      token: TOKEN,
      tribeSlug: TRIBE_SLUG,
    });

    expect(result).toEqual({
      ownerUserId: null,
      reason: "unknown_token",
      status: TRIBE_EVENT_MUTATION_STATUS.notFound,
    });
    expect(reader.readAsOwner).not.toHaveBeenCalled();
  });

  it("rejects a stored hash that does not match in the constant-time comparison", async () => {
    const reader = createReader({
      resolveToken: vi.fn(async () => ({ ...owner, tokenHash: "c".repeat(64) })),
    });
    const codec = createCodec();

    const result = await getTribeEventCalendarFeed(createDependencies(reader, codec))({
      eventTypes: [],
      token: TOKEN,
      tribeSlug: TRIBE_SLUG,
    });

    expect(codec.matchesHash).toHaveBeenCalledWith(TOKEN_HASH, "c".repeat(64));
    expect(result.status).toBe(TRIBE_EVENT_MUTATION_STATUS.notFound);
    expect(reader.readAsOwner).not.toHaveBeenCalled();
  });

  it("answers not found when the owner lost access to the tribe", async () => {
    const reader = createReader({ readAsOwner: vi.fn(async () => null) });

    await expect(
      getTribeEventCalendarFeed(createDependencies(reader))({
        eventTypes: [],
        token: TOKEN,
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({
      ownerUserId: owner.userId,
      reason: "access_revoked",
      status: TRIBE_EVENT_MUTATION_STATUS.notFound,
    });
  });

  it("hands the type filter to the reader and builds each series with its valid exceptions and last change", async () => {
    const weekly = createSeries();
    const reader = createReader({
      readAsOwner: vi.fn(async () => ({
        exceptions: [
          {
            eventId: weekly.id,
            kind: "cancelled" as const,
            newEndsAt: null,
            newStartsAt: null,
            originalStartsAt: "2026-05-14T21:00:00.000Z",
            reason: "Feriado",
          },
          // Not a slot of the series anymore (the series was edited): dropped.
          {
            eventId: weekly.id,
            kind: "cancelled" as const,
            newEndsAt: null,
            newStartsAt: null,
            originalStartsAt: "2026-05-15T21:00:00.000Z",
            reason: null,
          },
        ],
        // The reader applies the type filter before its row limit.
        series: [{ event: weekly, updatedAt: "2026-05-01T10:00:00.000Z" }],
        tribeName: "Matemática Pro",
      })),
    });

    const result = await getTribeEventCalendarFeed(createDependencies(reader))({
      eventTypes: ["workshop"],
      token: TOKEN,
      tribeSlug: TRIBE_SLUG,
    });

    expect(reader.readAsOwner).toHaveBeenCalledWith(
      expect.objectContaining({ eventTypes: ["workshop"] })
    );
    expect(result).toEqual({
      calendarName: "Matemática Pro",
      ownerUserId: owner.userId,
      series: [
        {
          event: { ...weekly, recurrenceRule: "FREQ=WEEKLY" },
          lastModifiedAt: "2026-05-01T10:00:00.000Z",
          occurrenceExceptions: [
            {
              endsAt: "2026-05-14T22:00:00.000Z",
              exception: { kind: "cancelled", reason: "Feriado" },
              originalStartsAt: "2026-05-14T21:00:00.000Z",
              startsAt: "2026-05-14T21:00:00.000Z",
            },
          ],
        },
      ],
      status: TRIBE_EVENT_MUTATION_STATUS.found,
    });
  });

  it("stops adding series once the VEVENT budget is spent", async () => {
    const budget = TRIBE_EVENT_CALENDAR_FEED_WINDOW.maxComponents;
    const series = Array.from({ length: budget + 1 }, (_, index) => ({
      event: createSeries({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        recurrenceFrequency: "none",
      }),
      updatedAt: "2026-05-01T10:00:00.000Z",
    }));
    const reader = createReader({
      readAsOwner: vi.fn(async () => ({ exceptions: [], series, tribeName: "Matemática Pro" })),
    });

    const result = await getTribeEventCalendarFeed(createDependencies(reader))({
      eventTypes: [],
      token: TOKEN,
      tribeSlug: TRIBE_SLUG,
    });

    expect(result.status === TRIBE_EVENT_MUTATION_STATUS.found && result.series).toHaveLength(
      budget
    );
  });

  it("skips a series that does not fit the remaining budget and keeps the later ones", async () => {
    const budget = TRIBE_EVENT_CALENDAR_FEED_WINDOW.maxComponents;
    const oversized = createSeries({ id: "00000000-0000-4000-8000-000000000001" });
    const oneOff = createSeries({
      endsAt: "2026-05-06T22:00:00.000Z",
      eventType: "social",
      id: "00000000-0000-4000-8000-000000000002",
      recurrenceFrequency: "none",
      startsAt: "2026-05-06T21:00:00.000Z",
      title: "Asado",
    });
    // One VEVENT per moved date: the weekly series needs budget + 1 components.
    const movedExceptions = Array.from({ length: budget }, (_, weekIndex) => {
      const originalStartsAt = Date.parse(oversized.startsAt) + weekIndex * WEEK_MILLISECONDS;

      return {
        eventId: oversized.id,
        kind: "moved" as const,
        newEndsAt: new Date(originalStartsAt + 2 * HOUR_MILLISECONDS).toISOString(),
        newStartsAt: new Date(originalStartsAt + HOUR_MILLISECONDS).toISOString(),
        originalStartsAt: new Date(originalStartsAt).toISOString(),
        reason: null,
      };
    });
    const reader = createReader({
      readAsOwner: vi.fn(async () => ({
        exceptions: movedExceptions,
        series: [
          { event: oversized, updatedAt: "2026-05-01T10:00:00.000Z" },
          { event: oneOff, updatedAt: "2026-05-02T10:00:00.000Z" },
        ],
        tribeName: "Matemática Pro",
      })),
    });

    const result = await getTribeEventCalendarFeed(createDependencies(reader))({
      eventTypes: [],
      token: TOKEN,
      tribeSlug: TRIBE_SLUG,
    });

    expect(
      result.status === TRIBE_EVENT_MUTATION_STATUS.found &&
        result.series.map((series) => series.event.id)
    ).toEqual([oneOff.id]);
  });
});
