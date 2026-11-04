/** @vitest-environment node */

/** Covers how the admission workflows tell an account change from a session that could not be read. */
import { describe, expect, it, vi } from "vitest";
import { authorizeInitialViewer, checkInitialViewer, INITIAL_VIEWER_CHECK, verifyInitialViewer } from "@/hooks/verify-initial-viewer";

type Viewer = { status: "ready"; value: { id: string } | null } | { status: "failed" } | { status: "aborted" };
const live = () => true;

/** @param viewer - Answer of the session read. @returns A viewer client that answers it. */
function clientAnswering(viewer: Viewer) { return { viewer: vi.fn(async () => viewer) }; }

describe("initial viewer checks", () => {
  it("should report a session that could not be read as unavailable, not as another account", async () => {
    const signal = new AbortController().signal;
    expect(await verifyInitialViewer({ client: clientAnswering({ status: "failed" }), viewerId: "leader-1", live }, signal, 1)).toBe(INITIAL_VIEWER_CHECK.unavailable);
    expect(await verifyInitialViewer({ client: clientAnswering({ status: "ready", value: { id: "other" } }), viewerId: "leader-1", live }, signal, 1)).toBe(INITIAL_VIEWER_CHECK.changed);
    expect(await verifyInitialViewer({ client: clientAnswering({ status: "ready", value: null }), viewerId: "leader-1", live }, signal, 1)).toBe(INITIAL_VIEWER_CHECK.changed);
    expect(await verifyInitialViewer({ client: clientAnswering({ status: "ready", value: { id: "leader-1" } }), viewerId: "leader-1", live }, signal, 1)).toBe(INITIAL_VIEWER_CHECK.current);
    expect(await verifyInitialViewer({ client: clientAnswering({ status: "aborted" }), viewerId: "leader-1", live }, signal, 1)).toBe(INITIAL_VIEWER_CHECK.stale);
  });

  it("should explain an unreadable session without closing the private view", async () => {
    const onViewerChanged = vi.fn(), onViewerUnavailable = vi.fn(), signal = new AbortController().signal;
    const options = { client: clientAnswering({ status: "failed" }), initial: { viewerId: "leader-1" }, live, onViewerChanged, onViewerUnavailable };
    expect(await authorizeInitialViewer(options, signal, 1)).toBe(false);
    expect(onViewerUnavailable).toHaveBeenCalledOnce();
    expect(onViewerChanged).not.toHaveBeenCalled();
  });

  it("should close the view only for another account and authorize the same one", async () => {
    const onViewerChanged = vi.fn(), onViewerUnavailable = vi.fn(), signal = new AbortController().signal;
    expect(await checkInitialViewer({ client: clientAnswering({ status: "ready", value: { id: "other" } }), initial: { viewerId: "leader-1" }, live, onViewerChanged, onViewerUnavailable }, signal, 1)).toBe(INITIAL_VIEWER_CHECK.changed);
    expect(onViewerChanged).toHaveBeenCalledOnce();
    expect(await authorizeInitialViewer({ client: clientAnswering({ status: "ready", value: { id: "leader-1" } }), initial: { viewerId: "leader-1" }, live, onViewerChanged, onViewerUnavailable }, signal, 1)).toBe(true);
    expect(onViewerUnavailable).not.toHaveBeenCalled();
  });
});
