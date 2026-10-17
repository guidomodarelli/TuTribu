/** @vitest-environment jsdom */
/** Exercises real notification DTO adapters, contextual reads and cached feedback without mocking UI or platform libraries. @module notification-center-admission-refresh-tests */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationCenter } from "@/hooks/use-notification-center";
import { useAdmissionNotificationInterest } from "@/hooks/use-admission-notification-context";
import { invalidateAdmissionNotificationRefresh } from "@/lib/notifications/admission-notification-refresh-store";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import type { NotificationInboxResponse } from "@/src/modules/notifications/application/results/notification-public-dto-schemas";

const inbox: NotificationInboxResponse = { unreadCount: 1, notifications: [{ id: "af24233e-0299-4db8-b036-3bc0d81db363", type: "admission_pending_created", createdAt: "2026-10-16T12:00:00.000Z", readAt: null, tribe: { name: "Tribu de prueba", slug: "test-refresh" }, admission: { requestId: "473ca637-6b25-466a-8df1-e44170dd31d9", audience: "reviewer" } }] };
const fetchOwn = vi.fn<typeof fetch>();
let focused = true;

beforeEach(() => {
  vi.useFakeTimers(); focused = true; fetchOwn.mockReset();
  // Only the own HTTP boundary and JSDOM's missing foreground state are controlled.
  vi.stubGlobal("fetch", fetchOwn);
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** @param body - Own public JSON response, consumed by the real browser DTO adapter. @returns A native fetch response without provider data. */
function response(body: unknown) { return Response.json(body); }
/** @param milliseconds - Elapsed visible browser time. */
async function advance(milliseconds: number) { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); }
/** @param active - Current actual admission visibility. @param isOpen - Whether the user left the notification list open. @returns The real notification owner behind its actual browser adapter. */
function useCenter(active = true, isOpen = false) {
  useAdmissionNotificationInterest(active, "review-inbox");
  return useNotificationCenter(inbox, { isOpen });
}

describe("admission-aware notification center", () => {
  it("should poll the badge at fifteen seconds in an active admission context", async () => {
    fetchOwn.mockResolvedValue(response({ unreadCount: 2 }));
    const { result } = renderHook(() => useCenter());
    await advance(15000);
    expect(fetchOwn).toHaveBeenCalledTimes(1);
    expect(fetchOwn.mock.calls[0][0]).toBe("/api/notifications/unread-count");
    expect(result.current.unreadCount).toBe(2);
  });

  it("should retain the ordinary minute policy outside admission contexts", async () => {
    fetchOwn.mockResolvedValue(response({ unreadCount: 2 }));
    const { result } = renderHook(() => useCenter(false));
    await advance(15000);
    expect(fetchOwn).not.toHaveBeenCalled();
    await advance(45000);
    expect(fetchOwn).toHaveBeenCalledTimes(1);
    expect(result.current.unreadCount).toBe(2);
  });

  it("should refresh an open list and its badge with one inbox read", async () => {
    fetchOwn.mockResolvedValue(response({ ...inbox, unreadCount: 0, notifications: inbox.notifications.map((notice) => ({ ...notice, readAt: "2026-10-16T12:01:00.000Z" })) }));
    const { result } = renderHook(() => useCenter(true, true));
    await advance(15000);
    expect(fetchOwn).toHaveBeenCalledTimes(1);
    expect(fetchOwn.mock.calls[0][0]).toBe("/api/notifications");
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications[0].readAt).not.toBeNull();
  });

  it("should preserve the existing rows and expose stale feedback when a background refresh fails", async () => {
    fetchOwn.mockRejectedValueOnce(new TypeError("Synthetic own network unavailable"));
    const { result } = renderHook(() => useCenter(true, true));
    await advance(15000);
    expect(result.current.notifications).toEqual(inbox.notifications);
    expect(result.current.refreshUnavailable).toBe(true);
    fetchOwn.mockResolvedValueOnce(response(inbox));
    await act(async () => result.current.refreshList());
    expect(result.current.refreshUnavailable).toBe(false);
  });

  it("should keep the same row reference after an equal public snapshot", async () => {
    fetchOwn.mockResolvedValue(response(inbox));
    const { result } = renderHook(() => useCenter(true, true));
    const rows = result.current.notifications;
    await advance(15000);
    expect(fetchOwn).toHaveBeenCalledTimes(1);
    expect(result.current.notifications).toBe(rows);
  });

  it("should coalesce an open-list tick with a manual load already in progress", async () => {
    let finish!: (value: Response) => void;
    fetchOwn.mockImplementationOnce(async () => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useCenter(true, true));
    act(() => result.current.refreshList());
    await advance(30000);
    expect(fetchOwn).toHaveBeenCalledTimes(1);
    await act(async () => finish(response(inbox)));
    expect(result.current.listStatus).toBe("loaded");
  });

  it("should reconcile a confirmed own action immediately without a route refresh", async () => {
    fetchOwn.mockResolvedValue(response({ unreadCount: 2 }));
    const { result } = renderHook(() => useCenter());
    await act(async () => invalidateAdmissionNotificationRefresh());
    expect(fetchOwn).toHaveBeenCalledTimes(1);
    expect(result.current.unreadCount).toBe(2);
  });

  it("should retain a requested list reconciliation across a pending read mark and an older list read", async () => {
    let finishRead!: (value: Response) => void, finishMark!: (value: Response) => void;
    const refreshed = { ...inbox, unreadCount: 0, notifications: inbox.notifications.map((notice) => ({ ...notice, readAt: "2026-10-16T12:01:00.000Z" })) };
    fetchOwn.mockImplementationOnce(async () => new Promise((resolve) => { finishRead = resolve; })).mockImplementationOnce(async () => new Promise((resolve) => { finishMark = resolve; })).mockResolvedValue(response(refreshed));
    const { result } = renderHook(() => useCenter(true, true));
    act(() => result.current.refreshList());
    act(() => result.current.markRead(inbox.notifications[0].id));
    act(() => result.current.refreshList());
    await act(async () => finishRead(response(inbox)));
    await act(async () => finishMark(response({ unreadCount: 0 })));
    expect(fetchOwn.mock.calls.filter((call) => call[0] === "/api/notifications")).toHaveLength(2);
    expect(result.current.notifications[0].readAt).toBe("2026-10-16T12:01:00.000Z");
  });

  it("should ignore an older badge failure after a newer inbox snapshot has restored freshness", async () => {
    let rejectCount!: (error: Error) => void;
    fetchOwn.mockImplementationOnce(async () => new Promise((_resolve, reject) => { rejectCount = reject; })).mockResolvedValue(response(inbox));
    const { result } = renderHook(() => useCenter());
    await advance(15000);
    await act(async () => result.current.refreshList());
    await act(async () => rejectCount(new TypeError("Synthetic old count response lost")));
    expect(result.current.refreshUnavailable).toBe(false);
    expect(result.current.notifications).toEqual(inbox.notifications);
  });

  it("should pause admission polling on blur and resume one current read on focus", async () => {
    fetchOwn.mockResolvedValue(response({ unreadCount: 2 }));
    renderHook(() => useCenter());
    focused = false;
    act(() => window.dispatchEvent(new Event("blur")));
    await advance(45000);
    expect(fetchOwn).not.toHaveBeenCalled();
    focused = true;
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(fetchOwn).toHaveBeenCalledTimes(1);
  });
});

describe("cached notification refresh feedback", () => {
  it("should keep cached notices visible together with an accessible retry after a load failure", () => {
    render(<NotificationPanel titleSlot={<h2>Notificaciones</h2>} notifications={inbox.notifications} unreadCount={1} listStatus="error" isMarkingAll={false} onMarkAllRead={() => undefined} onRetry={() => undefined} onSelectNotification={() => undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos actualizar");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
    expect(screen.getByRole("link")).toBeVisible();
  });
});
