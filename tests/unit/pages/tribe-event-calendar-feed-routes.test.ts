// @vitest-environment node
import ICAL from "ical.js";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { GET as GET_FEED } from "@/app/api/calendar/tribes/[slug]/feed/[feedFile]/route";
import {
  DELETE as DELETE_SUBSCRIPTION,
  GET as GET_SUBSCRIPTION,
  POST as POST_SUBSCRIPTION,
} from "@/app/api/tribes/[slug]/events/calendar-feed/route";
import { createCalendarFeedModules, createRequestModules } from "@/src/modules/setup";

const getTribeEventCalendarFeed = vi.fn();
const getAuthenticatedMember = vi.fn();
const managementUseCases = {
  getTribeEventCalendarFeedSubscription: vi.fn(),
  issueTribeEventCalendarFeedToken: vi.fn(),
  revokeTribeEventCalendarFeedToken: vi.fn(),
};
const logError = vi.fn();
const logInfo = vi.fn();
const logWarn = vi.fn();

vi.mock("@/src/modules/setup", () => ({
  createCalendarFeedModules: vi.fn(),
  createRequestModules: vi.fn(),
}));

// The logger writes to the console; the double lets the tests assert that
// the token never reaches a log line.
vi.mock("@/src/modules/shared/infrastructure/observability/server-logger", () => ({
  createServerLogger: vi.fn(() => ({ error: logError, info: logInfo, warn: logWarn })),
}));

const TRIBE_SLUG = "matematica-pro";
const TOKEN = "Zx8_Qm-3kP0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0uV";
const OWNER_ID = "user-ana";
const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const FEED_URL = `https://tutribu.example.com/api/calendar/tribes/${TRIBE_SLUG}/feed/${TOKEN}.ics`;
const MANAGEMENT_URL = `https://tutribu.example.com/api/tribes/${TRIBE_SLUG}/events/calendar-feed`;

const foundFeed = {
  calendarName: "Matemática Pro",
  ownerUserId: OWNER_ID,
  series: [
    {
      event: {
        capacity: null,
        description: null,
        endsAt: "2026-05-07T22:00:00.000Z",
        eventType: "workshop",
        id: EVENT_ID,
        meetingUrl: null,
        recurrenceFrequency: "weekly",
        recurrenceRule: "FREQ=WEEKLY",
        recurrenceUntil: null,
        startsAt: "2026-05-07T21:00:00.000Z",
        title: "Taller semanal",
      },
      lastModifiedAt: "2026-05-01T10:00:00.000Z",
      occurrenceExceptions: [],
    },
  ],
  status: "found",
};

function feedContext(feedFile = `${TOKEN}.ics`, slug = TRIBE_SLUG) {
  return { params: Promise.resolve({ feedFile, slug }) };
}

function managementContext(slug = TRIBE_SLUG) {
  return { params: Promise.resolve({ slug }) };
}

function everyLogLine(): string {
  return JSON.stringify([...logError.mock.calls, ...logInfo.mock.calls, ...logWarn.mock.calls]);
}

describe("GET /api/calendar/tribes/[slug]/feed/[token].ics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createCalendarFeedModules as Mock).mockResolvedValue({
      events: { useCases: { getTribeEventCalendarFeed } },
    });
  });

  it("serves the tribe calendar with calendar, cache, and privacy headers and no cookies", async () => {
    getTribeEventCalendarFeed.mockResolvedValue(foundFeed);

    const response = await GET_FEED(new Request(FEED_URL), feedContext());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("ETag")).toMatch(/^"[A-Za-z0-9_-]+"$/);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(getTribeEventCalendarFeed).toHaveBeenCalledWith({
      eventTypes: [],
      token: TOKEN,
      tribeSlug: TRIBE_SLUG,
    });

    const calendar = new ICAL.Component(ICAL.parse(body));

    expect(calendar.getFirstPropertyValue("x-wr-calname")).toBe("Matemática Pro");
    expect(calendar.getAllSubcomponents("vevent")).toHaveLength(1);
    expect(logInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ result: "served", tribeSlug: TRIBE_SLUG, userId: OWNER_ID }),
      })
    );
    expect(everyLogLine()).not.toContain(TOKEN);
  });

  it("answers 304 without a body when the calendar did not change", async () => {
    getTribeEventCalendarFeed.mockResolvedValue(foundFeed);
    const firstResponse = await GET_FEED(new Request(FEED_URL), feedContext());
    const etag = firstResponse.headers.get("ETag") ?? "";

    const response = await GET_FEED(
      new Request(FEED_URL, { headers: { "If-None-Match": `W/"other", ${etag}` } }),
      feedContext()
    );

    expect(response.status).toBe(304);
    expect(response.headers.get("ETag")).toBe(etag);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300");
    await expect(response.text()).resolves.toBe("");
  });

  it("filters by the validated type query", async () => {
    getTribeEventCalendarFeed.mockResolvedValue(foundFeed);

    await GET_FEED(new Request(`${FEED_URL}?type=workshop,qa&type=workshop`), feedContext());

    expect(getTribeEventCalendarFeed).toHaveBeenCalledWith({
      eventTypes: ["workshop", "qa"],
      token: TOKEN,
      tribeSlug: TRIBE_SLUG,
    });
  });

  it("rejects an unknown type with a safe 400", async () => {
    const response = await GET_FEED(new Request(`${FEED_URL}?type=party`), feedContext());

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Elegí un tipo de evento válido.");
    expect(getTribeEventCalendarFeed).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown or revoked token", "unknown_token", null],
    ["an owner who left the tribe or was blocked", "access_revoked", OWNER_ID],
  ])("answers the same generic 404 for %s", async (_label, reason, ownerUserId) => {
    getTribeEventCalendarFeed.mockResolvedValue({ ownerUserId, reason, status: "not_found" });

    const response = await GET_FEED(new Request(FEED_URL), feedContext());

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    await expect(response.text()).resolves.toBe("No encontramos este calendario.");
    expect(logWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ reason, result: "not_found", tribeSlug: TRIBE_SLUG }),
      })
    );
    expect(everyLogLine()).not.toContain(TOKEN);
  });

  it.each([
    ["a token that is too short", `${TOKEN.slice(1)}.ics`, TRIBE_SLUG],
    ["a missing .ics extension", TOKEN, TRIBE_SLUG],
    ["characters outside base64url", `${TOKEN.slice(1)}=.ics`, TRIBE_SLUG],
    ["a malformed slug", `${TOKEN}.ics`, "Not A Slug"],
  ])("answers 404 without touching the database for %s", async (_label, feedFile, slug) => {
    const response = await GET_FEED(new Request(FEED_URL), feedContext(feedFile, slug));

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe("No encontramos este calendario.");
    expect(createCalendarFeedModules).not.toHaveBeenCalled();
    expect(everyLogLine()).not.toContain(TOKEN.slice(1));
  });

  it("logs an unexpected failure without the token and answers a safe 500", async () => {
    getTribeEventCalendarFeed.mockRejectedValue(
      new Error(`connection failed while reading ${TOKEN}`)
    );

    const response = await GET_FEED(new Request(FEED_URL), feedContext());

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe("No pudimos generar el calendario.");
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ tribeSlug: TRIBE_SLUG }) })
    );
    const [loggedFailure] = logError.mock.calls[0] ?? [];

    expect(loggedFailure.error).toBeInstanceOf(Error);
    expect(loggedFailure.error.message).toBe("connection failed while reading [redacted-token]");
    expect(loggedFailure.error.stack).not.toContain(TOKEN);
  });
});

describe("/api/tribes/[slug]/events/calendar-feed", () => {
  const previousBaseUrl = process.env.BETTER_AUTH_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_URL = "https://tutribu.example.com/";
    getAuthenticatedMember.mockResolvedValue({ id: OWNER_ID });
    (createRequestModules as Mock).mockResolvedValue({
      auth: { useCases: { getAuthenticatedMember } },
      events: { useCases: managementUseCases },
    });
  });

  afterEach(() => {
    process.env.BETTER_AUTH_URL = previousBaseUrl;
  });

  it("requires a session", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    const response = await POST_SUBSCRIPTION(
      new Request(MANAGEMENT_URL, { method: "POST" }),
      managementContext()
    );

    expect(response.status).toBe(401);
    expect(managementUseCases.issueTribeEventCalendarFeedToken).not.toHaveBeenCalled();
  });

  it("rejects a malformed slug before calling the use case", async () => {
    const response = await GET_SUBSCRIPTION(new Request(MANAGEMENT_URL), managementContext("Bad Slug"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "No pudimos encontrar la tribu." });
    expect(managementUseCases.getTribeEventCalendarFeedSubscription).not.toHaveBeenCalled();
  });

  it("returns the allowlisted subscription state", async () => {
    managementUseCases.getTribeEventCalendarFeedSubscription.mockResolvedValue({
      status: "found",
      subscription: {
        createdAt: "2026-05-01T12:00:00.000Z",
        lastUsedAt: null,
        tokenHash: "b".repeat(64),
      },
    });

    const response = await GET_SUBSCRIPTION(new Request(MANAGEMENT_URL), managementContext());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      subscription: { createdAt: "2026-05-01T12:00:00.000Z", lastUsedAt: null },
    });
  });

  it("issues a token and answers the personal feed URL once, never cached", async () => {
    managementUseCases.issueTribeEventCalendarFeedToken.mockResolvedValue({
      status: "feed_token_issued",
      subscription: { createdAt: "2026-05-02T12:00:00.000Z", lastUsedAt: null },
      token: TOKEN,
    });

    const response = await POST_SUBSCRIPTION(
      new Request(MANAGEMENT_URL, { method: "POST" }),
      managementContext()
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      feedUrl: FEED_URL,
      message: "Tu link de calendario está listo. Copialo ahora: no lo vamos a volver a mostrar.",
      subscription: { createdAt: "2026-05-02T12:00:00.000Z", lastUsedAt: null },
    });
    expect(managementUseCases.issueTribeEventCalendarFeedToken).toHaveBeenCalledWith({
      tribeSlug: TRIBE_SLUG,
    });
    expect(everyLogLine()).not.toContain(TOKEN);
  });

  it.each([
    ["a non-local http deployment", "http://tutribu.example.com"],
    ["a malformed value", "not a url"],
    ["a missing value", undefined],
  ])(
    "answers a safe 500 without rotating the current link when the public base URL is %s",
    async (_label, invalidBaseUrl) => {
      if (invalidBaseUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = invalidBaseUrl;
      }

      const response = await POST_SUBSCRIPTION(
        new Request(MANAGEMENT_URL, { method: "POST" }),
        managementContext()
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        message: "No pudimos actualizar tu suscripción al calendario. Intentá de nuevo.",
      });
      expect(managementUseCases.issueTribeEventCalendarFeedToken).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ tribeSlug: TRIBE_SLUG, userId: OWNER_ID }),
        })
      );
    }
  );

  it("maps a viewer who cannot read the tribe to 403", async () => {
    managementUseCases.issueTribeEventCalendarFeedToken.mockResolvedValue({ status: "forbidden" });

    const response = await POST_SUBSCRIPTION(
      new Request(MANAGEMENT_URL, { method: "POST" }),
      managementContext()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Solo los miembros de la tribu pueden suscribirse a su calendario.",
    });
  });

  it("revokes the subscription idempotently", async () => {
    managementUseCases.revokeTribeEventCalendarFeedToken.mockResolvedValue({
      status: "feed_token_revoked",
    });

    const response = await DELETE_SUBSCRIPTION(
      new Request(MANAGEMENT_URL, { method: "DELETE" }),
      managementContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Suscripción desactivada. El link anterior ya no funciona.",
      subscription: null,
    });
  });

  it("answers a safe 500 when the issued DTO is unusable", async () => {
    managementUseCases.issueTribeEventCalendarFeedToken.mockResolvedValue({
      status: "feed_token_issued",
      subscription: { createdAt: "not-a-date", lastUsedAt: null },
      token: TOKEN,
    });

    const response = await POST_SUBSCRIPTION(
      new Request(MANAGEMENT_URL, { method: "POST" }),
      managementContext()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "No pudimos actualizar tu suscripción al calendario. Intentá de nuevo.",
    });
    expect(everyLogLine()).not.toContain(TOKEN);
  });
});
