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
  it("should expose only the owned admission reference and reject a fabricated audience or unusable subject", () => {
    const admission = { createdAt: eventNotification.createdAt, id: NOTIFICATION_ID, readAt: null, tribe: eventNotification.tribe, type: "admission_pending_created", admission: { requestId: EVENT_ID, audience: "applicant", internalReason: "Private reason", contact: "private@example.test" }, secretReference: "private-reference" };
    const parsed = notificationInboxSchema.parse({ notifications: [admission], unreadCount: 1 });
    expect(parsed.notifications[0]).toEqual({ createdAt: admission.createdAt, id: NOTIFICATION_ID, readAt: null, tribe: admission.tribe, type: admission.type, admission: { requestId: EVENT_ID, audience: "applicant" } });
    expect(notificationInboxSchema.safeParse({ notifications: [{ ...admission, admission: { requestId: EVENT_ID, audience: "leader" } }], unreadCount: 1 }).success).toBe(false);
    expect(notificationInboxSchema.safeParse({ notifications: [{ ...eventNotification, type: "admission_approved" }], unreadCount: 1 }).success).toBe(false);
  });

  it("accepts a usable inbox and strips fields outside the allowlist", () => {
    const parsed = notificationInboxSchema.safeParse({
      notifications: [{ ...eventNotification, dedupeKey: "secret", recipientUserId: "user-1" }],
      unreadCount: 1,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.notifications[0]).toEqual(eventNotification);
  });

  it("accepts the recording available notification as an event occurrence item", () => {
    const recordingNotification = { ...eventNotification, type: "event_recording_available" };

    expect(
      notificationInboxSchema.safeParse({ notifications: [recordingNotification], unreadCount: 1 })
        .data?.notifications[0]
    ).toEqual(recordingNotification);
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
