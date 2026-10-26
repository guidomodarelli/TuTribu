/** @vitest-environment jsdom */
/** Exercises visible admission refresh, original cancellation and shared interest using real React and AbortController. @module admission-notification-refresh-tests */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { useAdmissionNotificationRefresh, type AdmissionNotificationRefreshOutcome } from "@/hooks/use-admission-notification-refresh";
import { useAdmissionNotificationContext } from "@/hooks/use-admission-notification-context";

let focused = true;
let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  focused = true;
  visibility = "visible";
  // JSDOM has no real foreground tab. Only these browser facts are controlled;
  // hooks, React, event listeners and AbortController keep their real behavior.
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

/** @returns A settled own reader that can later expose a controlled failure. */
function reader() { return vi.fn(async (_signal: AbortSignal): Promise<AdmissionNotificationRefreshOutcome> => "refreshed"); }
/** @param milliseconds - Actual elapsed browser time represented by the clock. @returns After timers and the resulting React updates settle. */
async function advance(milliseconds: number) { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); }
/** @param state - The browser's actual visibility transition under test. */
function show(state: DocumentVisibilityState) { visibility = state; document.dispatchEvent(new Event("visibilitychange")); }

describe("visible admission notification refresh", () => {
  it("should wait fifteen seconds after the initial server snapshot and use the current own reader", async () => {
    const first = reader(), latest = reader();
    const { rerender } = renderHook(({ refresh }) => useAdmissionNotificationRefresh({ enabled: true, scopeKey: "own-request", refresh }), { initialProps: { refresh: first } });
    await advance(14000);
    expect(first).not.toHaveBeenCalled();
    rerender({ refresh: latest });
    await advance(1000);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(latest.mock.calls[0][0].aborted).toBe(false);
  });

  it("should coalesce repeated ticks while one original read remains unresolved", async () => {
    let finish!: (outcome: AdmissionNotificationRefreshOutcome) => void;
    const refresh = reader().mockImplementationOnce(async () => new Promise((resolve) => { finish = resolve; }));
    renderHook(() => useAdmissionNotificationRefresh({ enabled: true, scopeKey: "own-request", refresh }));
    await advance(45000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => finish("refreshed"));
    await advance(15000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("should abort the original read on blur, pause all ticks and reconcile once when focus returns", async () => {
    let finish!: (outcome: AdmissionNotificationRefreshOutcome) => void;
    const refresh = reader().mockImplementationOnce(async () => new Promise((resolve) => { finish = resolve; }));
    renderHook(() => useAdmissionNotificationRefresh({ enabled: true, scopeKey: "review-inbox", refresh }));
    await advance(15000);
    focused = false;
    act(() => window.dispatchEvent(new Event("blur")));
    expect(refresh.mock.calls[0][0].aborted).toBe(true);
    await act(async () => finish("failed"));
    await advance(45000);
    expect(refresh).toHaveBeenCalledTimes(1);
    focused = true;
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("should pause hidden documents and refresh once on a visible focused return", async () => {
    const refresh = reader();
    renderHook(() => useAdmissionNotificationRefresh({ enabled: true, scopeKey: "review-inbox", refresh }));
    act(() => show("hidden"));
    await advance(45000);
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => show("visible"));
    expect(refresh).toHaveBeenCalledTimes(1);
    await advance(15000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("should coalesce the visibility and focus events of one foreground return without aborting its fresh read", async () => {
    const refresh = reader();
    renderHook(() => useAdmissionNotificationRefresh({ enabled: true, scopeKey: "review-inbox", refresh }));
    focused = false;
    act(() => show("hidden"));
    focused = true;
    await act(async () => { show("visible"); window.dispatchEvent(new Event("focus")); });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0][0].aborted).toBe(false);
  });

  it("should retain a visible failure until a successful read replaces it", async () => {
    const refresh = reader().mockResolvedValueOnce("failed").mockResolvedValueOnce("skipped");
    const { result } = renderHook(() => useAdmissionNotificationRefresh({ enabled: true, scopeKey: "own-request", refresh }));
    await advance(15000);
    expect(result.current.refreshUnavailable).toBe(true);
    await advance(15000);
    expect(result.current.refreshUnavailable).toBe(true);
    await advance(15000);
    expect(result.current.refreshUnavailable).toBe(false);
  });

  it("should map an unexpected own read failure without leaking its private message", async () => {
    const refresh = reader().mockRejectedValueOnce(new Error("Synthetic private dependency detail"));
    const { result } = renderHook(() => useAdmissionNotificationRefresh({ enabled: true, scopeKey: "own-request", refresh }));
    await advance(15000);
    expect(result.current.refreshUnavailable).toBe(true);
    expect(result.current).not.toHaveProperty("error");
  });

  it("should cancel an older read on a confirmed own action and coalesce one immediate fresh reconciliation", async () => {
    let finish!: (outcome: AdmissionNotificationRefreshOutcome) => void;
    const refresh = reader().mockImplementationOnce(async () => new Promise((resolve) => { finish = resolve; }));
    const owner = renderHook(() => useAdmissionNotificationRefresh({ enabled: true, scopeKey: "own-request", refresh }));
    const context = renderHook(() => useAdmissionNotificationContext());
    const priorRevision = context.result.current.revision;
    await advance(15000);
    act(() => { owner.result.current.confirmOwnAction(); owner.result.current.confirmOwnAction(); });
    expect(refresh.mock.calls[0][0].aborted).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(context.result.current.revision).toBeGreaterThan(priorRevision);
    await act(async () => finish("refreshed"));
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(owner.result.current.refreshUnavailable).toBe(false);
  });

  it("should abort a previous scope without adopting its late failure into the next request", async () => {
    let finish!: (outcome: AdmissionNotificationRefreshOutcome) => void;
    const refresh = reader().mockImplementationOnce(async () => new Promise((resolve) => { finish = resolve; }));
    const { result, rerender } = renderHook(({ scopeKey }) => useAdmissionNotificationRefresh({ enabled: true, scopeKey, refresh }), { initialProps: { scopeKey: "request-one" } });
    await advance(15000);
    rerender({ scopeKey: "request-two" });
    expect(refresh.mock.calls[0][0].aborted).toBe(true);
    await act(async () => finish("failed"));
    expect(result.current.refreshUnavailable).toBe(false);
    await advance(15000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("should register active admission interest until the final enabled owner leaves", () => {
    const context = renderHook(() => useAdmissionNotificationContext());
    expect(context.result.current.active).toBe(false);
    const first = renderHook(() => useAdmissionNotificationRefresh({ enabled: true, scopeKey: "review", refresh: reader() }));
    const second = renderHook(() => useAdmissionNotificationRefresh({ enabled: true, scopeKey: "own", refresh: reader() }));
    expect(context.result.current.active).toBe(true);
    first.unmount();
    expect(context.result.current.active).toBe(true);
    second.unmount();
    expect(context.result.current.active).toBe(false);
  });

  it("should cancel outstanding work and avoid new reads when the owner is disabled", async () => {
    let finish!: (outcome: AdmissionNotificationRefreshOutcome) => void;
    const refresh = reader().mockImplementationOnce(async () => new Promise((resolve) => { finish = resolve; }));
    const { result, rerender } = renderHook(({ enabled }) => useAdmissionNotificationRefresh({ enabled, scopeKey: "review", refresh }), { initialProps: { enabled: true } });
    await advance(15000);
    rerender({ enabled: false });
    expect(refresh.mock.calls[0][0].aborted).toBe(true);
    await act(async () => finish("failed"));
    await advance(45000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.refreshUnavailable).toBe(false);
  });

  it("should keep the server snapshot independent of browser interests already registered in the same runtime", () => {
    renderHook(() => useAdmissionNotificationRefresh({ enabled: true, scopeKey: "review", refresh: reader() }));
    const context = renderHook(() => useAdmissionNotificationContext());
    expect(context.result.current.active).toBe(true);
    /** @returns Only the observed rendering policy, without any private notification data. */
    function ServerProbe() { const state = useAdmissionNotificationContext(); return <output>{state.active ? "active" : "idle"}</output>; }
    expect(renderToString(<ServerProbe />)).toContain("idle");
    expect(context.result.current.active).toBe(true);
  });
});
