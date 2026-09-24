// @vitest-environment node
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { PATCH } from "@/app/api/notifications/[notificationId]/route";
import { POST as POST_READ_ALL } from "@/app/api/notifications/read-all/route";
import { GET as GET_INBOX } from "@/app/api/notifications/route";
import { GET as GET_UNREAD_COUNT } from "@/app/api/notifications/unread-count/route";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = vi.fn();
const useCases = {
  getNotificationInbox: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
};
const logError = vi.fn();
const logWarn = vi.fn();

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock("@/src/modules/shared/infrastructure/observability/server-logger", () => ({
  createServerLogger: vi.fn(() => ({ error: logError, info: vi.fn(), warn: logWarn })),
}));

const BASE_URL = "https://tutribu.example.com/api/notifications";
const NOTIFICATION_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const inboxItem = {
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
  type: "event_reminder_15m",
};

function markContext(notificationId = NOTIFICATION_ID) {
  return { params: Promise.resolve({ notificationId }) };
}

function patchRequest(body: unknown, notificationId = NOTIFICATION_ID): Request {
  return new Request(`${BASE_URL}/${notificationId}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

describe("notification routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedMember.mockResolvedValue({ id: "user-ana", name: "Ana" });
    (createRequestModules as Mock).mockResolvedValue({
      auth: { useCases: { getAuthenticatedMember } },
      notifications: { useCases },
    });
  });

  it("requires a session on every route", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    const responses = await Promise.all([
      GET_INBOX(new Request(BASE_URL)),
      GET_UNREAD_COUNT(new Request(`${BASE_URL}/unread-count`)),
      POST_READ_ALL(new Request(`${BASE_URL}/read-all`, { method: "POST" })),
      PATCH(patchRequest({ isRead: true }), markContext()),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
    expect(useCases.getNotificationInbox).not.toHaveBeenCalled();
    expect(useCases.markNotificationRead).not.toHaveBeenCalled();
  });

  it("serves the inbox through its allowlist without caching", async () => {
    useCases.getNotificationInbox.mockResolvedValue({
      notifications: [{ ...inboxItem, dedupeKey: "internal" }],
      unreadCount: 1,
    });

    const response = await GET_INBOX(new Request(BASE_URL));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ notifications: [inboxItem], unreadCount: 1 });
  });

  it("answers a safe 500 when the inbox DTO is unusable and logs only issue paths", async () => {
    useCases.getNotificationInbox.mockResolvedValue({ notifications: [{ id: "broken" }], unreadCount: 1 });

    const response = await GET_INBOX(new Request(BASE_URL));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "No pudimos cargar tus notificaciones. Intentá de nuevo.",
    });
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ reason: "public_dto_rejected", userId: "user-ana" }),
      })
    );
  });

  it("serves the unread count", async () => {
    useCases.getUnreadNotificationCount.mockResolvedValue({ unreadCount: 4 });

    const response = await GET_UNREAD_COUNT(new Request(`${BASE_URL}/unread-count`));

    await expect(response.json()).resolves.toEqual({ unreadCount: 4 });
  });

  it("rejects a malformed id or body at the boundary without calling the use case", async () => {
    const badId = await PATCH(patchRequest({ isRead: true }, "not-a-uuid"), markContext("not-a-uuid"));
    const badBody = await PATCH(patchRequest({ isRead: false }), markContext());

    expect(badId.status).toBe(400);
    await expect(badId.json()).resolves.toEqual({ message: "No encontramos esa notificación." });
    expect(badBody.status).toBe(400);
    expect(useCases.markNotificationRead).not.toHaveBeenCalled();
    expect(JSON.stringify(logWarn.mock.calls)).not.toContain("not-a-uuid");
  });

  it("marks an own notification and answers 404 for anyone else's", async () => {
    useCases.markNotificationRead
      .mockResolvedValueOnce({ status: "marked", unreadCount: 2 })
      .mockResolvedValueOnce({ status: "not_found" });

    const marked = await PATCH(patchRequest({ isRead: true }), markContext());
    const missing = await PATCH(patchRequest({ isRead: true }), markContext());

    expect(useCases.markNotificationRead).toHaveBeenCalledWith({ notificationId: NOTIFICATION_ID });
    await expect(marked.json()).resolves.toEqual({ unreadCount: 2 });
    expect(missing.status).toBe(404);
  });

  it("marks every notification as read", async () => {
    useCases.markAllNotificationsRead.mockResolvedValue({ unreadCount: 0 });

    const response = await POST_READ_ALL(new Request(`${BASE_URL}/read-all`, { method: "POST" }));

    await expect(response.json()).resolves.toEqual({ unreadCount: 0 });
  });

  it("hides an unexpected failure behind safe Spanish copy", async () => {
    useCases.markAllNotificationsRead.mockRejectedValue(new Error("deadlock detected on notifications"));

    const response = await POST_READ_ALL(new Request(`${BASE_URL}/read-all`, { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      message: "No pudimos marcar la notificación como leída. Intentá de nuevo.",
    });
  });
});
