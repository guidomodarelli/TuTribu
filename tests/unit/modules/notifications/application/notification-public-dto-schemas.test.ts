import { describe, expect, it } from "vitest";

import {
  notificationInboxSchema,
  notificationMarkReadResponseSchema,
} from "@/src/modules/notifications/application/results/notification-public-dto-schemas";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const NOTIFICATION_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

const eventNotification = {
  createdAt: "2026-05-06T12:00:00.000Z",
  event: {
    eventId: EVENT_ID,
    eventTitle: "Taller",
    occurrenceStartsAt: "2026-05-07T21:00:00.000Z",
    startsAt: "2026-05-07T21:00:00.000Z",
  },
  id: NOTIFICATION_ID,
  readAt: null,
  tribe: { name: "Matemática Pro", slug: "matematica-pro" },
  type: "event_reminder_24h",
};

describe("notification public DTO schemas", () => {
  it("accepts a usable inbox and strips fields outside the allowlist", () => {
    const parsed = notificationInboxSchema.safeParse({
      notifications: [{ ...eventNotification, dedupeKey: "secret", recipientUserId: "user-1" }],
      unreadCount: 1,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.notifications[0]).toEqual(eventNotification);
  });

  it("rejects an inbox item whose subject does not match its type", () => {
    expect(
      notificationInboxSchema.safeParse({
        notifications: [{ ...eventNotification, type: "event_proposal_reviewed" }],
        unreadCount: 0,
      }).success
    ).toBe(false);
    expect(notificationMarkReadResponseSchema.safeParse({ unreadCount: -1 }).success).toBe(false);
  });
});
