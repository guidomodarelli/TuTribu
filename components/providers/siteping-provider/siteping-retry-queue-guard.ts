/**
 * Keeps SitePing's offline retry queue within the browser's localStorage quota.
 *
 * When a feedback POST fails (offline, server 5xx, timeout), `@siteping/widget`
 * persists the whole payload under `localStorage["siteping_retry_queue"]` so it
 * can resend later. With `enableScreenshot: true` that payload carries a
 * multi-MB base64 `screenshotDataUrl`, and the widget keeps up to 20 entries.
 * A couple of captured screenshots overflow the ~5 MB localStorage quota; the
 * widget wraps its `setItem` in a `try/catch {}` that swallows the quota error,
 * so the retry is dropped silently — exactly when the user is offline or the
 * server is failing and retry persistence matters most.
 *
 * The widget exposes no hook to transform the payload before it is queued, so
 * this guard intercepts the write at the only seam available: `setItem`. It
 * leaves every other key untouched and, for the retry-queue key, strips the
 * screenshot data URL from each queued payload before the value is stored. The
 * screenshot is still uploaded on the original (online) attempt; only the
 * persisted-for-retry copy drops it — the heaviest, least essential part for a
 * resend — so the textual report, annotations and diagnostics always survive a
 * retry instead of the whole queue silently failing to persist.
 */

/** localStorage key `@siteping/widget` uses for its offline retry queue. */
export const SITEPING_RETRY_QUEUE_STORAGE_KEY = "siteping_retry_queue";

/** A single retry-queue entry as persisted by the widget. */
interface RetryQueueEntry {
  endpoint: string;
  payload: Record<string, unknown> & { screenshotDataUrl?: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRetryQueueEntry(value: unknown): value is RetryQueueEntry {
  return isRecord(value) && isRecord(value.payload);
}

/**
 * Removes the `screenshotDataUrl` from every entry of a serialized retry queue
 * so the stored value stays small enough to fit the localStorage quota.
 *
 * Defensive by design: any value that is not the expected JSON array of queue
 * entries is returned verbatim, so the guard never corrupts a payload it does
 * not understand.
 *
 * @param serializedQueue - The raw string the widget is about to persist.
 * @returns The sanitized string to store, or the input unchanged when it is not
 *   a recognizable retry queue or already screenshot-free.
 */
export function stripScreenshotsFromRetryQueue(serializedQueue: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedQueue);
  } catch {
    return serializedQueue;
  }

  if (!Array.isArray(parsed)) {
    return serializedQueue;
  }

  let didStrip = false;
  const sanitized = parsed.map((entry) => {
    if (!isRetryQueueEntry(entry) || entry.payload.screenshotDataUrl == null) {
      return entry;
    }
    didStrip = true;
    return {
      ...entry,
      payload: { ...entry.payload, screenshotDataUrl: null },
    };
  });

  return didStrip ? JSON.stringify(sanitized) : serializedQueue;
}

/**
 * Installs the retry-queue guard by wrapping `Storage.prototype.setItem` so the
 * widget's persistence of `siteping_retry_queue` is stripped of screenshots
 * before it reaches localStorage. Also sanitizes any queue already persisted
 * before the guard ran, so the first guarded write starts quota-safe.
 *
 * Patching the prototype (not the instance) avoids the Web Storage named-property
 * setter that turns `localStorage.setItem = fn` into a stored item; the wrapper
 * forwards `this`, so only the targeted key is rewritten and every other write
 * passes through untouched.
 *
 * @param storage - Storage to read the pre-existing queue from. Defaults to the
 *   global `localStorage`; injectable for testing.
 * @returns A cleanup function that restores the original `setItem`.
 */
export function installSitepingRetryQueueGuard(
  storage: Storage = window.localStorage
): () => void {
  const storagePrototype = Object.getPrototypeOf(storage) as Storage;
  const originalSetItem = storagePrototype.setItem;

  // Reclaim a screenshot left by a queue persisted before this guard installed,
  // so the next guarded write starts from a quota-safe baseline.
  try {
    const existing = storage.getItem(SITEPING_RETRY_QUEUE_STORAGE_KEY);
    if (existing !== null) {
      const sanitized = stripScreenshotsFromRetryQueue(existing);
      if (sanitized !== existing) {
        originalSetItem.call(storage, SITEPING_RETRY_QUEUE_STORAGE_KEY, sanitized);
      }
    }
  } catch {
    // Best-effort cleanup of the pre-existing queue; the wrapper below still
    // protects every future write even if reading the current value failed
    // (e.g. storage access denied in a privacy mode).
  }

  const guardedSetItem = function (
    this: Storage,
    key: string,
    value: string
  ): void {
    if (key === SITEPING_RETRY_QUEUE_STORAGE_KEY) {
      originalSetItem.call(this, key, stripScreenshotsFromRetryQueue(String(value)));
      return;
    }
    originalSetItem.call(this, key, value);
  };

  storagePrototype.setItem = guardedSetItem;

  return () => {
    if (storagePrototype.setItem === guardedSetItem) {
      storagePrototype.setItem = originalSetItem;
    }
  };
}
