/**
 * Loads an occurrence resource (post-event detail, conversation) after the
 * mutations a previous opening of that occurrence may still be committing, so
 * the answer never shows the state those mutations are about to replace.
 * Answers that arrive after `signal` aborts (reload, occurrence change or
 * unmount) are dropped, so only the latest load reports.
 *
 * @param waitForMutations - Settles once the pending mutations of the occurrence finish.
 * @param request - Fetches the resource.
 * @param signal - Abort signal of the current load.
 * @param handlers - `onLoaded` receives the answer; `onNetworkFailure` runs when the request fails without being aborted.
 */
export function loadTribeEventOccurrenceAfterMutations<TResult>(
  waitForMutations: () => Promise<unknown>,
  request: (signal: AbortSignal) => Promise<TResult>,
  signal: AbortSignal,
  handlers: { onLoaded: (result: TResult) => void; onNetworkFailure: () => void }
): void {
  waitForMutations()
    .then(() => (signal.aborted ? null : request(signal)))
    .then((result) => {
      if (!result || signal.aborted) {
        return;
      }

      handlers.onLoaded(result);
    })
    .catch(() => {
      // Aborted requests are the expected cleanup; any other failure is a
      // network error the caller shows with its safe fallback copy.
      if (!signal.aborted) {
        handlers.onNetworkFailure();
      }
    });
}
