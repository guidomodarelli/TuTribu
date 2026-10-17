/** @vitest-environment jsdom */
/** Reproduces a confirmed admission action while its route's private reader is paused. @module notification-own-action-reconciliation-tests */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdmissionNotificationRefresh } from "@/hooks/use-admission-notification-refresh";
import { useNotificationCenter } from "@/hooks/use-notification-center";
import type { AdmissionNotificationRefreshOutcome } from "@/hooks/use-admission-notification-refresh";
import type { NotificationInboxResponse } from "@/src/modules/notifications/application/results/notification-public-dto-schemas";

const original: NotificationInboxResponse = { notifications: [], unreadCount: 0 };
const updated: NotificationInboxResponse = { unreadCount: 1, notifications: [{ id: "bc693176-9f18-4149-aa38-8248da1cd756", type: "admission_approved", createdAt: "2026-10-16T12:00:00Z", readAt: null, tribe: { name: "Academia sintética", slug: "test-own-action" }, admission: { requestId: "d8da878d-7c99-421c-baaa-b3793e91028e", audience: "applicant" } }] };
const readOwn = vi.fn(async (_signal: AbortSignal): Promise<AdmissionNotificationRefreshOutcome> => "refreshed");
const fetchOwn = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchOwn.mockReset(); readOwn.mockClear(); vi.useFakeTimers(); vi.stubGlobal("fetch", fetchOwn);
  // JSDOM has no foreground tab; all React/store/cancellation behavior remains real.
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("confirmed own admission reconciliation", () => {
  it("should refresh the open list immediately even while a write temporarily pauses its admission reader", async () => {
    fetchOwn.mockImplementation(async (input) => Response.json(String(input).endsWith("unread-count") ? { unreadCount: 1 } : updated));
    const { result, rerender } = renderHook(({ busy }) => {
      const owner = useAdmissionNotificationRefresh({ enabled: true, paused: busy, scopeKey: "pending-own-request", refresh: readOwn });
      const center = useNotificationCenter(original, { isOpen: true });
      return { owner, center };
    }, { initialProps: { busy: false } });
    rerender({ busy: true });
    await act(async () => result.current.owner.confirmOwnAction());
    expect(fetchOwn).toHaveBeenCalledTimes(1);
    expect(fetchOwn.mock.calls[0][0]).toBe("/api/notifications");
    expect(result.current.center.notifications).toEqual(updated.notifications);
  });

  it("should pause the private reader during a write while retaining the admission cadence in the center", async () => {
    fetchOwn.mockResolvedValue(Response.json({ unreadCount: 1 }));
    renderHook(() => {
      useAdmissionNotificationRefresh({ enabled: true, paused: true, scopeKey: "pending-own-request", refresh: readOwn });
      return useNotificationCenter(original);
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(readOwn).not.toHaveBeenCalled();
    expect(fetchOwn).toHaveBeenCalledTimes(1);
    expect(fetchOwn.mock.calls[0][0]).toBe("/api/notifications/unread-count");
  });
});
