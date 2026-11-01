/** Re-checks the native account around private responses of the academy admission workflows. @module verify-initial-viewer */

/**
 * Outcome of checking that the signed-in account is still the one the workflow started with. `unavailable` means the session
 * could not be read (a 5xx, a cut network, a timeout): it proves no account change, so nothing private is closed.
 */
export const INITIAL_VIEWER_CHECK = { current: "current", changed: "changed", unavailable: "unavailable", stale: "stale" } as const;
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
 * @returns `stale` when the action is no longer current (nothing to do), `unavailable` when the session could not be read,
 * `changed` when another account (or none) is signed in, `current` otherwise.
 */
export async function verifyInitialViewer({ client, viewerId, live }: InitialViewerCheckOptions, signal: AbortSignal, scope: number): Promise<InitialViewerCheck> {
  if (!live(signal, scope)) return INITIAL_VIEWER_CHECK.stale;
  const viewer = await client.viewer(signal);
  if (!live(signal, scope) || viewer.status === "aborted") return INITIAL_VIEWER_CHECK.stale;
  if (viewer.status === "failed") return INITIAL_VIEWER_CHECK.unavailable;
  if (viewer.value?.id !== viewerId) return INITIAL_VIEWER_CHECK.changed;
  return INITIAL_VIEWER_CHECK.current;
}

/** What to do when the check does not confirm the account: close the view on a change, or explain a session that could not be read. */
type InitialViewerAuthorization = {
  client: ViewerClient; initial: { viewerId: string } | null; live: (signal: AbortSignal, scope: number) => boolean;
  onViewerChanged: () => void;
  /** Runs when the session could not be read; the private view stays as it was, since nothing proves another account. */
  onViewerUnavailable?: () => void;
};

/**
 * @param options - Workflow client, the account the workflow started with (`null` when it never loaded), the liveness check and what to do when the account is not confirmed.
 * @param signal - Current cancellable action.
 * @param scope - Render generation.
 * @returns The check, after running `onViewerChanged` for an account change or `onViewerUnavailable` for a session that could not be read;
 * a workflow that never loaded is `changed` without running either.
 */
export async function checkInitialViewer({ client, initial, live, onViewerChanged, onViewerUnavailable }: InitialViewerAuthorization, signal: AbortSignal, scope: number): Promise<InitialViewerCheck> {
  if (!initial) return INITIAL_VIEWER_CHECK.changed;
  const check = await verifyInitialViewer({ client, viewerId: initial.viewerId, live }, signal, scope);
  if (check === INITIAL_VIEWER_CHECK.changed) onViewerChanged();
  if (check === INITIAL_VIEWER_CHECK.unavailable) onViewerUnavailable?.();
  return check;
}

/**
 * @param options - Same as {@link checkInitialViewer}.
 * @param signal - Current cancellable action.
 * @param scope - Render generation.
 * @returns Whether the action may go on with the same account.
 */
export async function authorizeInitialViewer(options: InitialViewerAuthorization, signal: AbortSignal, scope: number): Promise<boolean> {
  return await checkInitialViewer(options, signal, scope) === INITIAL_VIEWER_CHECK.current;
}
