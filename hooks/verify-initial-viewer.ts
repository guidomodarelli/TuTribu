/** Re-checks the native account around private responses of the academy admission workflows. @module verify-initial-viewer */

/** Outcome of checking that the signed-in account is still the one the workflow started with. */
export const INITIAL_VIEWER_CHECK = { current: "current", changed: "changed", stale: "stale" } as const;
export type InitialViewerCheck = (typeof INITIAL_VIEWER_CHECK)[keyof typeof INITIAL_VIEWER_CHECK];

/** Answer of a workflow client's viewer request. */
type ViewerResult = { status: "ready"; value: { id: string } | null } | { status: "failed" } | { status: "aborted" };
/** Client able to read the current native account. */
type ViewerClient = { viewer(signal: AbortSignal): Promise<ViewerResult> };

/** What a viewer check needs: the workflow client, the account it started with and its liveness check. */
type InitialViewerCheckOptions = { client: ViewerClient; viewerId: string; live: (signal: AbortSignal, scope: number) => boolean };

/**
 * @param options - Workflow client that reads the current account, the account the workflow started with and whether the action and render generation are still current.
 * @param signal - Current cancellable action.
 * @param scope - Render generation.
 * @returns `stale` when the action is no longer current (nothing to do), `changed` when another account (or none) is signed in, `current` otherwise.
 */
export async function verifyInitialViewer({ client, viewerId, live }: InitialViewerCheckOptions, signal: AbortSignal, scope: number): Promise<InitialViewerCheck> {
  if (!live(signal, scope)) return INITIAL_VIEWER_CHECK.stale;
  const viewer = await client.viewer(signal);
  if (!live(signal, scope) || viewer.status === "aborted") return INITIAL_VIEWER_CHECK.stale;
  if (viewer.status !== "ready" || viewer.value?.id !== viewerId) return INITIAL_VIEWER_CHECK.changed;
  return INITIAL_VIEWER_CHECK.current;
}

/**
 * @param options - Workflow client, the account the workflow started with (`null` when it never loaded), the liveness check and what to hide once another account is signed in.
 * @param signal - Current cancellable action.
 * @param scope - Render generation.
 * @returns Whether the action may go on with the same account; `onViewerChanged` runs before a `false` caused by an account change.
 */
export async function authorizeInitialViewer({ client, initial, live, onViewerChanged }: { client: ViewerClient; initial: { viewerId: string } | null; live: (signal: AbortSignal, scope: number) => boolean; onViewerChanged: () => void }, signal: AbortSignal, scope: number): Promise<boolean> {
  if (!initial) return false;
  const check = await verifyInitialViewer({ client, viewerId: initial.viewerId, live }, signal, scope);
  if (check === INITIAL_VIEWER_CHECK.changed) { onViewerChanged(); return false; }
  return check === INITIAL_VIEWER_CHECK.current;
}
