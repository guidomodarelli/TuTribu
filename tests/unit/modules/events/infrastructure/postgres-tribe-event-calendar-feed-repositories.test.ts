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

  const FEED_QUERY = {
    eventTypes: [],
    lastUsedRefreshMinutes: 60,
    maxComponents: 500,
    maxExceptions: 2000,
    owner: { tokenHash: TOKEN_HASH, tokenId: TOKEN_ID, tribeId: TRIBE_ID, userId: OWNER_ID },
    rangeEnd: "2027-05-10T12:00:00.000Z",
    rangeStart: "2026-02-09T12:00:00.000Z",
    tribeSlug: TRIBE_SLUG,
  } as const;

  const FEED_TRIBE_NAME = "Matemática Pro";

  /**
   * Row the snapshot returns when the token and its owner still pass the
   * guard but no series fits: the feed is legitimately empty.
   */
  const ACCESS_ONLY_ROW = { feed_tribe_name: FEED_TRIBE_NAME, id: null };

  function buildSeriesRow(id: string, exceptions: unknown) {
    return {
      calendar_sequence: 7,
      capacity: null,
      description: null,
      ends_at: "2026-05-07T22:00:00.000Z",
      event_type: "workshop",
      exceptions,
      feed_tribe_name: FEED_TRIBE_NAME,
      id,
      meeting_url: null,
      recurrence_frequency: "weekly",
      recurrence_until: null,
      starts_at: new Date("2026-05-07T21:00:00.000Z"),
      title: "Taller semanal",
      updated_at: new Date("2026-05-01T10:00:00.000Z"),
    };
  }

  it("reads the series and their exceptions in a single statement as the token owner", async () => {
    const ownerExecute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: TRIBE_ID, name: "Matemática Pro" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          buildSeriesRow(EVENT_ID, [
            {
              event_id: EVENT_ID,
              kind: "moved",
              new_ends_at: null,
              new_starts_at: "2026-05-22T21:00:00+00:00",
              original_starts_at: "2026-05-21T21:00:00+00:00",
              reason: "Feriado",
            },
            {
              event_id: EVENT_ID,
              kind: "cancelled",
              new_ends_at: null,
              new_starts_at: null,
              original_starts_at: "2026-05-14T21:00:00+00:00",
              reason: null,
            },
          ]),
        ],
      });
    const reader = createReader(new Map([[OWNER_ID, ownerExecute]]));

    const snapshot = await reader.readAsOwner(FEED_QUERY);

    expect(snapshot).toEqual({
      exceptions: [
        {
          eventId: EVENT_ID,
          kind: "moved",
          newEndsAt: null,
          newStartsAt: "2026-05-22T21:00:00.000Z",
          originalStartsAt: "2026-05-21T21:00:00.000Z",
          reason: "Feriado",
        },
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
    // Access check, throttled touch, and ONE read: series and exceptions come
    // from the same statement snapshot, so a concurrent exception change can
    // never be paired with the previous SEQUENCE of its series.
    expect(ownerExecute).toHaveBeenCalledTimes(3);

    const [accessSql, touchSql, feedSql] = ownerExecute.mock.calls.map(([statement]) =>
      getSqlText(statement)
    );

    expect(accessSql).toContain("public.can_read_tribe_content(tribes.id)");
    expect(accessSql).toContain("event_calendar_feed_tokens.user_id = public.current_app_user_id()");
    expect(accessSql).toContain("event_calendar_feed_tokens.revoked_at is null");
    expect(touchSql).toContain("set last_used_at = timezone('utc', now())");
    expect(touchSql).toContain("make_interval(mins =>");
    expect(feedSql).toContain("public.can_read_tribe_content(events.tribe_id)");
    expect(feedSql).toContain("public.can_read_tribe_content(event_occurrence_exceptions.tribe_id)");
    expect(feedSql).not.toContain("events.event_type = any(");
  });

  it("rechecks the active token and the owner's access inside the snapshot statement", async () => {
    const ownerExecute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: TRIBE_ID, name: "Matemática Pro" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [ACCESS_ONLY_ROW] });
    const reader = createReader(new Map([[OWNER_ID, ownerExecute]]));

    await reader.readAsOwner(FEED_QUERY);

    // Under READ COMMITTED every statement takes a new snapshot: the guard
    // must live in the same statement that reads the series, so a revocation
    // or a block committed after the access check is seen by the read itself.
    const feedSql = getSqlText(ownerExecute.mock.calls[2]?.[0]);
    const guardSql = feedSql.slice(
      feedSql.indexOf("feed_access as materialized"),
      feedSql.indexOf("candidate_series as materialized")
    );

    expect(guardSql).toContain("event_calendar_feed_tokens.id =");
    expect(guardSql).toContain("event_calendar_feed_tokens.token_hash =");
    expect(guardSql).toContain("event_calendar_feed_tokens.user_id = public.current_app_user_id()");
    expect(guardSql).toContain("event_calendar_feed_tokens.revoked_at is null");
    expect(guardSql).toContain("public.can_read_tribe_content(tribes.id)");
  });

  it("returns null when the token was revoked or the owner blocked after the access check", async () => {
    const ownerExecute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: TRIBE_ID, name: "Matemática Pro" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const reader = createReader(new Map([[OWNER_ID, ownerExecute]]));

    // Same answer as an invalid token, never an empty feed that would make
    // the calendar app delete the events it already has.
    await expect(reader.readAsOwner(FEED_QUERY)).resolves.toBeNull();
  });

  it("returns an empty feed for an active token of a member whose tribe has no series", async () => {
    const ownerExecute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: TRIBE_ID, name: "Matemática Pro" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [ACCESS_ONLY_ROW] });
    const reader = createReader(new Map([[OWNER_ID, ownerExecute]]));

    await expect(reader.readAsOwner(FEED_QUERY)).resolves.toEqual({
      exceptions: [],
      series: [],
      tribeName: FEED_TRIBE_NAME,
    });
  });

  it("maps a series whose exception aggregate is empty or null", async () => {
    const secondEventId = "7a4d8b2f-3c5e-4d9f-8a21-2b3c4d5e6f70";
    const ownerExecute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: TRIBE_ID, name: "Matemática Pro" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [buildSeriesRow(EVENT_ID, []), buildSeriesRow(secondEventId, null)],
      });
    const reader = createReader(new Map([[OWNER_ID, ownerExecute]]));

    const snapshot = await reader.readAsOwner(FEED_QUERY);

    expect(snapshot?.series.map((series) => series.event.id)).toEqual([EVENT_ID, secondEventId]);
    expect(snapshot?.exceptions).toEqual([]);
  });

  it("filters the series by the requested types inside the read", async () => {
    const ownerExecute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: TRIBE_ID, name: "Matemática Pro" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [ACCESS_ONLY_ROW] });
    const reader = createReader(new Map([[OWNER_ID, ownerExecute]]));

    await expect(
      reader.readAsOwner({ ...FEED_QUERY, eventTypes: ["workshop", "qa"] })
    ).resolves.toEqual({ exceptions: [], series: [], tribeName: "Matemática Pro" });

    const feedSql = getSqlText(ownerExecute.mock.calls[2]?.[0]);
    const typePredicateIndex = feedSql.indexOf("events.event_type = any(");

    expect(typePredicateIndex).toBeGreaterThan(-1);
    expect(feedSql.slice(typePredicateIndex)).toMatch(/workshop.*qa.*::text\[\]/s);
  });

  it("selects a series by a moved date only while that date is still a slot of its schedule", async () => {
    const ownerExecute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: TRIBE_ID, name: "Matemática Pro" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [ACCESS_ONLY_ROW] });
    const reader = createReader(new Map([[OWNER_ID, ownerExecute]]));

    await reader.readAsOwner(FEED_QUERY);

    // A moved row kept after a schedule edit no longer belongs to the series:
    // it must not pull an otherwise out-of-window series into the feed.
    const feedSql = getSqlText(ownerExecute.mock.calls[2]?.[0]);
    const candidateSql = feedSql.slice(0, feedSql.indexOf("valid_exceptions as materialized"));

    expect(candidateSql).toMatch(
      /public\.is_tribe_event_series_occurrence\(\s*moved_exceptions\.original_starts_at,\s*events\.starts_at,\s*events\.recurrence_frequency,\s*events\.recurrence_until\s*\)/
    );
  });

  it("budgets only series whose schedule produces an occurrence overlapping the window", async () => {
    const ownerExecute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: TRIBE_ID, name: "Matemática Pro" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [ACCESS_ONLY_ROW] });
    const reader = createReader(new Map([[OWNER_ID, ownerExecute]]));

    await reader.readAsOwner(FEED_QUERY);

    // A series whose `recurrence_until` reaches the window but whose cadence
    // has no date in it (monthly on the 31st ending mid-February) must not
    // enter the candidates, or it would consume the budgets of real series.
    const feedSql = getSqlText(ownerExecute.mock.calls[2]?.[0]);
    const candidateSql = feedSql.slice(0, feedSql.indexOf("valid_exceptions as materialized"));

    expect(candidateSql).toMatch(
      /public\.tribe_event_series_has_occurrence_in_range\(\s*events\.starts_at,\s*events\.ends_at,\s*events\.recurrence_frequency,\s*events\.recurrence_until,/
    );
  });

  it("returns null and reads nothing else when the owner lost access", async () => {
    const ownerExecute = vi.fn(async (..._statements: unknown[]) => ({ rows: [] }));
    const reader = createReader(new Map([[OWNER_ID, ownerExecute]]));

    await expect(
      reader.readAsOwner(FEED_QUERY)
    ).resolves.toBeNull();
    expect(ownerExecute).toHaveBeenCalledTimes(1);
  });
});
