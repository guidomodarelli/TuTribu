import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  buildAppleCalendarSubscriptionUrl,
  buildGoogleCalendarSubscriptionUrl,
} from "@/lib/calendar/calendar-subscription-links";
import {
  fetchTribeEventCalendarFeedRequest,
  issueTribeEventCalendarFeedRequest,
  revokeTribeEventCalendarFeedRequest,
} from "@/lib/events/tribe-event-calendar-feed-api-client";

const TRIBE_SLUG = "matematica-pro";
const FEED_URL =
  "https://tutribu.example.com/api/calendar/tribes/matematica-pro/feed/Zx8_Qm-3kP0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0uV.ics";
const ENDPOINT = "/api/tribes/matematica-pro/events/calendar-feed";
const SUBSCRIPTION_ID = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";
const PREVIOUS_SUBSCRIPTION_ID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

function respondWith(body: unknown, status = 200) {
  (globalThis.fetch as Mock).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );
}

describe("calendar subscription links", () => {
  it("opens Apple Calendar with the webcal scheme of the same feed", () => {
    expect(buildAppleCalendarSubscriptionUrl(FEED_URL)).toBe(
      "webcal://tutribu.example.com/api/calendar/tribes/matematica-pro/feed/Zx8_Qm-3kP0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0uV.ics"
    );
  });

  it("adds the https feed to Google Calendar through the cid parameter", () => {
    const googleUrl = new URL(buildGoogleCalendarSubscriptionUrl(FEED_URL));

    expect(googleUrl.origin + googleUrl.pathname).toBe(
      "https://calendar.google.com/calendar/render"
    );
    expect(googleUrl.searchParams.get("cid")).toBe(FEED_URL);
  });
});

describe("calendar feed browser adapter", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // `fetch` is the transport port of this adapter; the DTO guards run for real.
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("loads the subscription state and drops fields outside the contract", async () => {
    respondWith({
      subscription: {
        createdAt: "2026-05-01T12:00:00.000Z",
        id: SUBSCRIPTION_ID,
        lastUsedAt: null,
        tokenHash: "b".repeat(64),
      },
    });
    const controller = new AbortController();

    await expect(
      fetchTribeEventCalendarFeedRequest({ signal: controller.signal, tribeSlug: TRIBE_SLUG })
    ).resolves.toEqual({
      isSuccess: true,
      message: null,
      subscription: { createdAt: "2026-05-01T12:00:00.000Z", id: SUBSCRIPTION_ID, lastUsedAt: null },
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(ENDPOINT, {
      cache: "no-store",
      signal: controller.signal,
    });
  });

  it("issues a link with POST, sending the known subscription as precondition", async () => {
    respondWith(
      {
        feedUrl: FEED_URL,
        message: "Listo.",
        subscription: { createdAt: "2026-05-02T12:00:00.000Z", id: SUBSCRIPTION_ID, lastUsedAt: null },
      },
      201
    );

    await expect(
      issueTribeEventCalendarFeedRequest({
        expectedSubscriptionId: PREVIOUS_SUBSCRIPTION_ID,
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({
      feedUrl: FEED_URL,
      isSuccess: true,
      message: "Listo.",
      subscription: { createdAt: "2026-05-02T12:00:00.000Z", id: SUBSCRIPTION_ID, lastUsedAt: null },
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(ENDPOINT, {
      body: JSON.stringify({ expectedSubscriptionId: PREVIOUS_SUBSCRIPTION_ID }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  });

  it("flags a 409 as a stale subscription state and keeps the safe route message", async () => {
    respondWith({ message: "Tu link de calendario cambió." }, 409);
    respondWith({ message: "Solo los miembros de la tribu pueden suscribirse a su calendario." }, 403);

    await expect(
      issueTribeEventCalendarFeedRequest({ expectedSubscriptionId: null, tribeSlug: TRIBE_SLUG })
    ).resolves.toEqual({
      isSubscriptionChanged: true,
      isSuccess: false,
      message: "Tu link de calendario cambió.",
    });
    await expect(
      issueTribeEventCalendarFeedRequest({ expectedSubscriptionId: null, tribeSlug: TRIBE_SLUG })
    ).resolves.toEqual({
      isSubscriptionChanged: false,
      isSuccess: false,
      message: "Solo los miembros de la tribu pueden suscribirse a su calendario.",
    });
  });

  it("rejects an issued body whose link is not http(s)", async () => {
    respondWith(
      {
        feedUrl: "javascript:alert(1)",
        message: "Listo.",
        subscription: { createdAt: "2026-05-02T12:00:00.000Z", id: SUBSCRIPTION_ID, lastUsedAt: null },
      },
      201
    );

    await expect(
      issueTribeEventCalendarFeedRequest({ expectedSubscriptionId: null, tribeSlug: TRIBE_SLUG })
    ).resolves.toEqual({
      isSubscriptionChanged: false,
      isSuccess: false,
      message: null,
    });
  });

  it("revokes with DELETE, sending the shown subscription as precondition in the query", async () => {
    respondWith({ message: "Suscripción desactivada.", subscription: null });
    respondWith({ message: "Suscripción desactivada.", subscription: null });

    await expect(
      revokeTribeEventCalendarFeedRequest({
        expectedSubscriptionId: SUBSCRIPTION_ID,
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({
      isSuccess: true,
      message: "Suscripción desactivada.",
    });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      `${ENDPOINT}?expectedSubscriptionId=${SUBSCRIPTION_ID}`,
      { cache: "no-store", method: "DELETE" }
    );

    // No subscription on screen: the precondition is the absent parameter.
    await revokeTribeEventCalendarFeedRequest({ expectedSubscriptionId: null, tribeSlug: TRIBE_SLUG });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, ENDPOINT, {
      cache: "no-store",
      method: "DELETE",
    });
  });

  it("flags a revocation 409 as a stale subscription state and keeps the safe route message", async () => {
    respondWith({ message: "Tu link de calendario cambió." }, 409);
    respondWith({ message: "Iniciá sesión para gestionar eventos." }, 401);

    await expect(
      revokeTribeEventCalendarFeedRequest({
        expectedSubscriptionId: PREVIOUS_SUBSCRIPTION_ID,
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({
      isSubscriptionChanged: true,
      isSuccess: false,
      message: "Tu link de calendario cambió.",
    });
    await expect(
      revokeTribeEventCalendarFeedRequest({ expectedSubscriptionId: null, tribeSlug: TRIBE_SLUG })
    ).resolves.toEqual({
      isSubscriptionChanged: false,
      isSuccess: false,
      message: "Iniciá sesión para gestionar eventos.",
    });
  });
});
