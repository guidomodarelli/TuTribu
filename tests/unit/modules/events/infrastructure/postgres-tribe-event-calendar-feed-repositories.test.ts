import { describe, expect, it, vi, type Mock } from "vitest";

import {
  PostgresTribeEventCalendarFeedReader,
  PostgresTribeEventCalendarFeedTokenRepository,
} from "@/src/modules/events/infrastructure/repositories/postgres-tribe-event-calendar-feed-repository";

const TRIBE_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const TRIBE_SLUG = "matematica-pro";
const TOKEN_ID = "5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e";
const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const TOKEN_HASH = "b".repeat(64);
const OWNER_ID = "user-ana";

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value: unknown }).value)
      ) {
        return (chunk as { value: string[] }).value.join("");
      }

      if (chunk && typeof chunk === "object" && "queryChunks" in chunk) {
        return getSqlText(chunk);
      }

      return "";
    })
    .join("");
}

function createExecutor(execute: Mock) {
  return async <T,>(callback: (database: never) => Promise<T>) =>
    callback({ execute } as never);
}

describe("PostgresTribeEventCalendarFeedTokenRepository", () => {
  it("reports the active subscription of the signed-in member without the hash", async () => {
    const execute = vi.fn(async (..._statements: unknown[]) => ({
      rows: [
        {
          can_read: true,
          created_at: new Date("2026-05-01T12:00:00.000Z"),
          last_used_at: null,
          tribe_id: TRIBE_ID,
        },
      ],
    }));
    const repository = new PostgresTribeEventCalendarFeedTokenRepository(createExecutor(execute));

    await expect(repository.findActive({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      status: "found",
      subscription: { createdAt: "2026-05-01T12:00:00.000Z", lastUsedAt: null },
    });

    const lookupSql = getSqlText(execute.mock.calls[0]?.[0]);

    expect(lookupSql).toContain("event_calendar_feed_tokens.user_id = public.current_app_user_id()");
    expect(lookupSql).toContain("event_calendar_feed_tokens.revoked_at is null");
    expect(lookupSql).not.toContain("token_hash");
  });

  it("maps a missing tribe, a viewer who cannot read it, and no active token", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ can_read: false, created_at: null, tribe_id: TRIBE_ID }] })
      .mockResolvedValueOnce({ rows: [{ can_read: true, created_at: null, tribe_id: TRIBE_ID }] });
    const repository = new PostgresTribeEventCalendarFeedTokenRepository(createExecutor(execute));

    await expect(repository.findActive({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      status: "not_found",
    });
    await expect(repository.findActive({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      status: "forbidden",
    });
    await expect(repository.findActive({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      status: "found",
      subscription: null,
    });
  });

  it("serializes regeneration per member, revokes the previous token, and stores the hash", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ can_read: true, created_at: null, tribe_id: TRIBE_ID }] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ created_at: "2026-05-02T12:00:00.000Z", last_used_at: null }],
      });
    const repository = new PostgresTribeEventCalendarFeedTokenRepository(createExecutor(execute));

    await expect(
      repository.issue({ tokenHash: TOKEN_HASH, tribeSlug: TRIBE_SLUG })
    ).resolves.toEqual({
      status: "feed_token_issued",
      subscription: { createdAt: "2026-05-02T12:00:00.000Z", lastUsedAt: null },
    });

    const [lockSql, revokeSql, insertSql] = execute.mock.calls
      .slice(1)
      .map(([statement]) => getSqlText(statement));

    expect(lockSql).toContain("pg_advisory_xact_lock");
    expect(revokeSql).toContain("set revoked_at = timezone('utc', clock_timestamp())");
    expect(revokeSql).toContain("user_id = public.current_app_user_id()");
    expect(insertSql).toContain("insert into public.event_calendar_feed_tokens");
    expect(insertSql).toContain("public.current_app_user_id()");
  });

  it("never issues a token for a viewer who cannot read the tribe", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ can_read: false, created_at: null, tribe_id: TRIBE_ID }] });
    const repository = new PostgresTribeEventCalendarFeedTokenRepository(createExecutor(execute));

    await expect(
      repository.issue({ tokenHash: TOKEN_HASH, tribeSlug: TRIBE_SLUG })
    ).resolves.toEqual({ status: "forbidden" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("revokes idempotently only the member's own token", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ can_read: false, created_at: null, tribe_id: TRIBE_ID }] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresTribeEventCalendarFeedTokenRepository(createExecutor(execute));

    // Revoking the own link does not require read access to the tribe content.
    await expect(repository.revoke({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      status: "feed_token_revoked",
    });
    expect(getSqlText(execute.mock.calls[2]?.[0])).toContain(
      "user_id = public.current_app_user_id()"
    );
    await expect(repository.revoke({ tribeSlug: TRIBE_SLUG })).resolves.toEqual({
      status: "not_found",
    });
  });
  it("takes the regeneration lock before revoking, so a concurrent regeneration is revoked too", async () => {
    const issueExecute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ can_read: true, created_at: null, tribe_id: TRIBE_ID }] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ created_at: "2026-05-02T12:00:00.000Z", last_used_at: null }],
      });
    const revokeExecute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ can_read: true, created_at: null, tribe_id: TRIBE_ID }] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [] });

    await new PostgresTribeEventCalendarFeedTokenRepository(createExecutor(issueExecute)).issue({
      tokenHash: TOKEN_HASH,
      tribeSlug: TRIBE_SLUG,
    });
    await new PostgresTribeEventCalendarFeedTokenRepository(createExecutor(revokeExecute)).revoke({
      tribeSlug: TRIBE_SLUG,
    });

    const issueLockSql = getSqlText(issueExecute.mock.calls[1]?.[0]);
    const [revokeLockSql, revokeSql] = revokeExecute.mock.calls
      .slice(1)
      .map(([statement]) => getSqlText(statement));

    expect(revokeLockSql).toContain("pg_advisory_xact_lock");
    expect(revokeLockSql).toBe(issueLockSql);
    expect(revokeSql).toContain("set revoked_at = timezone('utc', clock_timestamp())");
  });
});

describe("PostgresTribeEventCalendarFeedReader", () => {
  function createReader(executeByUser: Map<string | null, Mock>) {
    return new PostgresTribeEventCalendarFeedReader((userId) => {
      const execute = executeByUser.get(userId);

      if (!execute) {
        throw new Error(`Unexpected database context for ${String(userId)}`);
      }

      return createExecutor(execute);
    });
  }

  it("resolves the token without a user through the definer function", async () => {
    const anonymousExecute = vi.fn(async (..._statements: unknown[]) => ({
      rows: [{ token_hash: TOKEN_HASH, token_id: TOKEN_ID, tribe_id: TRIBE_ID, user_id: OWNER_ID }],
    }));
    const reader = createReader(new Map([[null, anonymousExecute]]));

    await expect(reader.resolveToken(TOKEN_HASH)).resolves.toEqual({
      tokenHash: TOKEN_HASH,
      tokenId: TOKEN_ID,
      tribeId: TRIBE_ID,
      userId: OWNER_ID,
    });
    expect(getSqlText(anonymousExecute.mock.calls[0]?.[0])).toContain(
      "public.resolve_event_calendar_feed_token("
    );
  });

  it("returns null for an unknown token", async () => {
    const reader = createReader(new Map([[null, vi.fn(async () => ({ rows: [] }))]]));

    await expect(reader.resolveToken(TOKEN_HASH)).resolves.toBeNull();
  });

  it("reads as the token owner: access check, throttled touch, series, and exceptions", async () => {
    const ownerExecute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: TRIBE_ID, name: "Matemática Pro" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            calendar_sequence: 7,
            capacity: null,
            description: null,
            ends_at: "2026-05-07T22:00:00.000Z",
            event_type: "workshop",
            exception_count: 1,
            id: EVENT_ID,
            meeting_url: null,
            recurrence_frequency: "weekly",
            recurrence_until: null,
            starts_at: new Date("2026-05-07T21:00:00.000Z"),
            title: "Taller semanal",
            updated_at: new Date("2026-05-01T10:00:00.000Z"),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: EVENT_ID,
            kind: "cancelled",
            new_ends_at: null,
            new_starts_at: null,
            original_starts_at: "2026-05-14T21:00:00.000Z",
            reason: null,
          },
        ],
      });
    const reader = createReader(new Map([[OWNER_ID, ownerExecute]]));

    const snapshot = await reader.readAsOwner({
      eventTypes: [],
      lastUsedRefreshMinutes: 60,
      maxExceptions: 2000,
      maxSeries: 500,
      owner: { tokenHash: TOKEN_HASH, tokenId: TOKEN_ID, tribeId: TRIBE_ID, userId: OWNER_ID },
      rangeEnd: "2027-05-10T12:00:00.000Z",
      rangeStart: "2026-02-09T12:00:00.000Z",
      tribeSlug: TRIBE_SLUG,
    });

    expect(snapshot).toEqual({
      exceptions: [
        {
          eventId: EVENT_ID,
          kind: "cancelled",
          newEndsAt: null,
          newStartsAt: null,
          originalStartsAt: "2026-05-14T21:00:00.000Z",
          reason: null,
        },
      ],
      series: [
        {
          calendarSequence: 7,
          event: {
            capacity: null,
            description: null,
            endsAt: "2026-05-07T22:00:00.000Z",
            eventType: "workshop",
            id: EVENT_ID,
            meetingUrl: null,
            recurrenceFrequency: "weekly",
            recurrenceUntil: null,
            startsAt: "2026-05-07T21:00:00.000Z",
            title: "Taller semanal",
          },
          updatedAt: "2026-05-01T10:00:00.000Z",
        },
      ],
      tribeName: "Matemática Pro",
    });

    const [accessSql, touchSql, seriesSql, exceptionsSql] = ownerExecute.mock.calls.map(
      ([statement]) => getSqlText(statement)
    );

    expect(accessSql).toContain("public.can_read_tribe_content(tribes.id)");
    expect(accessSql).toContain("event_calendar_feed_tokens.user_id = public.current_app_user_id()");
    expect(accessSql).toContain("event_calendar_feed_tokens.revoked_at is null");
    expect(touchSql).toContain("set last_used_at = timezone('utc', now())");
    expect(touchSql).toContain("make_interval(mins =>");
    expect(seriesSql).toContain("public.can_read_tribe_content(events.tribe_id)");
    expect(seriesSql).toContain("limit");
    expect(seriesSql).toContain("events.calendar_sequence");
    expect(seriesSql).not.toContain("events.event_type = any(");
    expect(exceptionsSql).toContain("event_occurrence_exceptions.event_id = any(");
  });

  it("keeps the complete exceptions of every returned series and omits a series that does not fit the budget", async () => {
    const firstSeriesId = "11111111-1111-4111-8111-111111111111";
    const oversizedSeriesId = "22222222-2222-4222-8222-222222222222";
    const lastSeriesId = "33333333-3333-4333-8333-333333333333";
    const buildSeriesRow = (id: string, exceptionCount: number) => ({
      calendar_sequence: 0,
      capacity: null,
      description: null,
      ends_at: "2026-05-07T22:00:00.000Z",
      event_type: "workshop",
      exception_count: String(exceptionCount),
      id,
      meeting_url: null,
      recurrence_frequency: "weekly",
      recurrence_until: null,
      starts_at: "2026-05-07T21:00:00.000Z",
      title: "Taller semanal",
      updated_at: "2026-05-01T10:00:00.000Z",
    });
    const buildCancellation = (eventId: string, originalStartsAt: string) => ({
      event_id: eventId,
      kind: "cancelled",
      new_ends_at: null,
      new_starts_at: null,
      original_starts_at: originalStartsAt,
      reason: null,
    });
    const ownerExecute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: TRIBE_ID, name: "Matemática Pro" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          buildSeriesRow(firstSeriesId, 2),
          buildSeriesRow(oversizedSeriesId, 5),
          buildSeriesRow(lastSeriesId, 1),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          buildCancellation(firstSeriesId, "2026-05-21T21:00:00.000Z"),
          buildCancellation(lastSeriesId, "2026-05-14T21:00:00.000Z"),
          buildCancellation(firstSeriesId, "2026-05-14T21:00:00.000Z"),
        ],
      });
    const reader = createReader(new Map([[OWNER_ID, ownerExecute]]));

    const snapshot = await reader.readAsOwner({
      eventTypes: [],
      lastUsedRefreshMinutes: 60,
      maxExceptions: 3,
      maxSeries: 500,
      owner: { tokenHash: TOKEN_HASH, tokenId: TOKEN_ID, tribeId: TRIBE_ID, userId: OWNER_ID },
      rangeEnd: "2027-05-10T12:00:00.000Z",
      rangeStart: "2026-02-09T12:00:00.000Z",
      tribeSlug: TRIBE_SLUG,
    });

    // The oversized series is left out instead of being emitted with only
    // part of its cancellations; the smaller series after it still fits.
    expect(snapshot?.series.map((series) => series.event.id)).toEqual([
      firstSeriesId,
      lastSeriesId,
    ]);
    expect(snapshot?.exceptions).toHaveLength(3);

    const seriesSql = getSqlText(ownerExecute.mock.calls[2]?.[0]);
    const exceptionsSql = getSqlText(ownerExecute.mock.calls[3]?.[0]);

    expect(seriesSql).toContain("exception_count");
    expect(exceptionsSql).toContain(firstSeriesId);
    expect(exceptionsSql).toContain(lastSeriesId);
    expect(exceptionsSql).not.toContain(oversizedSeriesId);
    // No global row limit that could cut the exceptions of a returned series.
    expect(exceptionsSql).not.toContain("limit");
  });

  it("reads no exceptions when every series with exceptions exceeds the budget", async () => {
    const ownerExecute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: TRIBE_ID, name: "Matemática Pro" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            calendar_sequence: 0,
            capacity: null,
            description: null,
            ends_at: "2026-05-07T22:00:00.000Z",
            event_type: "workshop",
            exception_count: 4,
            id: EVENT_ID,
            meeting_url: null,
            recurrence_frequency: "weekly",
            recurrence_until: null,
            starts_at: "2026-05-07T21:00:00.000Z",
            title: "Taller semanal",
            updated_at: "2026-05-01T10:00:00.000Z",
          },
        ],
      });
    const reader = createReader(new Map([[OWNER_ID, ownerExecute]]));

    await expect(
      reader.readAsOwner({
        eventTypes: [],
        lastUsedRefreshMinutes: 60,
        maxExceptions: 3,
        maxSeries: 500,
        owner: { tokenHash: TOKEN_HASH, tokenId: TOKEN_ID, tribeId: TRIBE_ID, userId: OWNER_ID },
        rangeEnd: "2027-05-10T12:00:00.000Z",
        rangeStart: "2026-02-09T12:00:00.000Z",
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({ exceptions: [], series: [], tribeName: "Matemática Pro" });
    expect(ownerExecute).toHaveBeenCalledTimes(3);
  });

  it("filters the series by the requested types before the row limit", async () => {
    const ownerExecute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: TRIBE_ID, name: "Matemática Pro" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const reader = createReader(new Map([[OWNER_ID, ownerExecute]]));

    await reader.readAsOwner({
      eventTypes: ["workshop", "qa"],
      lastUsedRefreshMinutes: 60,
      maxExceptions: 2000,
      maxSeries: 500,
      owner: { tokenHash: TOKEN_HASH, tokenId: TOKEN_ID, tribeId: TRIBE_ID, userId: OWNER_ID },
      rangeEnd: "2027-05-10T12:00:00.000Z",
      rangeStart: "2026-02-09T12:00:00.000Z",
      tribeSlug: TRIBE_SLUG,
    });

    const seriesSql = getSqlText(ownerExecute.mock.calls[2]?.[0]);
    const typePredicateIndex = seriesSql.indexOf("events.event_type = any(");

    expect(typePredicateIndex).toBeGreaterThan(-1);
    expect(seriesSql.slice(typePredicateIndex)).toMatch(/workshop.*qa.*::text\[\]/s);
    expect(typePredicateIndex).toBeLessThan(seriesSql.lastIndexOf("limit"));
  });

  it("returns null and reads nothing else when the owner lost access", async () => {
    const ownerExecute = vi.fn(async (..._statements: unknown[]) => ({ rows: [] }));
    const reader = createReader(new Map([[OWNER_ID, ownerExecute]]));

    await expect(
      reader.readAsOwner({
        eventTypes: [],
        lastUsedRefreshMinutes: 60,
        maxExceptions: 2000,
        maxSeries: 500,
        owner: { tokenHash: TOKEN_HASH, tokenId: TOKEN_ID, tribeId: TRIBE_ID, userId: OWNER_ID },
        rangeEnd: "2027-05-10T12:00:00.000Z",
        rangeStart: "2026-02-09T12:00:00.000Z",
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toBeNull();
    expect(ownerExecute).toHaveBeenCalledTimes(1);
  });
});
