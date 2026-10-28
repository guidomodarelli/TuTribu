/** @vitest-environment jsdom */
/** Exercises original inbox cancellation when a later confirmed admission action requires a current snapshot. @module notification-own-action-inflight-tests */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdmissionNotificationRefresh, type AdmissionNotificationRefreshOutcome  } from "@/hooks/use-admission-notification-refresh";
import { useNotificationCenter } from "@/hooks/use-notification-center";
import type { NotificationInboxResponse } from "@/src/modules/notifications/application/results/notification-public-dto-schemas";

const original: NotificationInboxResponse = { notifications: [], unreadCount: 0 };
const updated: NotificationInboxResponse = { unreadCount: 1, notifications: [{ id: "bc693176-9f18-4149-aa38-8248da1cd756", type: "admission_approved", createdAt: "2026-10-16T12:00:00Z", readAt: null, tribe: { name: "Academia sintética", slug: "test-inflight-action" }, admission: { requestId: "d8da878d-7c99-421c-baaa-b3793e91028e", audience: "applicant" } }] };
const fetchOwn = vi.fn<typeof fetch>();
const readOwn: (signal: AbortSignal) => Promise<AdmissionNotificationRefreshOutcome> = async () => "refreshed";

beforeEach(() => {
  fetchOwn.mockReset(); vi.stubGlobal("fetch", fetchOwn);
  // Only JSDOM foreground facts and the owned HTTP edge are controlled.
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("an original inbox preceding an own admission action", () => {
  it("should replace the old manual read with one current successor and ignore its late reply", async () => {
    const previous = Promise.withResolvers<Response>(), current = Promise.withResolvers<Response>();
    fetchOwn.mockImplementationOnce(() => previous.promise).mockImplementationOnce(() => current.promise);
    const { result } = renderHook(() => ({ owner: useAdmissionNotificationRefresh({ enabled: true, scopeKey: "pending-own-request", refresh: readOwn }), center: useNotificationCenter(original, { isOpen: true }) }));
    await act(async () => result.current.center.refreshList());
    const originalSignal = fetchOwn.mock.calls[0][1]?.signal;
    expect(fetchOwn).toHaveBeenCalledTimes(1);
    await act(async () => result.current.owner.confirmOwnAction());
    expect(fetchOwn).toHaveBeenCalledTimes(2);
    expect(originalSignal?.aborted).toBe(true);
    await act(async () => result.current.center.refreshList());
    expect(fetchOwn).toHaveBeenCalledTimes(2);
    await act(async () => previous.resolve(Response.json(original)));
    expect(result.current.center.notifications).toEqual([]);
    await act(async () => current.resolve(Response.json(updated)));
    expect(result.current.center.notifications).toEqual(updated.notifications);
    expect(result.current.center.unreadCount).toBe(1);
    expect(fetchOwn.mock.calls.map(([input]) => String(input))).toEqual(["/api/notifications", "/api/notifications"]);
  });
});
