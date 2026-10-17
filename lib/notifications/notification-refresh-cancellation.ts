/** Links browser lifecycle cancellation without depending on AbortSignal.any support. @module notification-refresh-cancellation */

/** @param controller - Exact original own inbox read. @param signal - Optional joining lifecycle scope. @returns Cleanup for this attachment only, retaining the original controller identity. */
export function linkNotificationRefreshCancellation(controller: AbortController, signal?: AbortSignal): () => void {
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  return () => signal?.removeEventListener("abort", abort);
}
