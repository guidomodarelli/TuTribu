/**
 * Bounds a same-origin browser request so a hung response can never leave an action in progress forever. The deadline
 * aborts the request through its own signal and remembers that it fired, so the caller tells its own cancellation (a
 * navigation, an unmount) apart from a response that took too long.
 *
 * @module browser-request-deadline
 */
import { BROWSER_REQUEST_TIMEOUT_MS } from "@/src/constants/browser-request";

export type BrowserRequestDeadline = {
  /** Aborts when the caller cancels or when the deadline fires; pass it to `fetch`. */
  signal: AbortSignal;
  /** Whether the deadline, not the caller, ended the request. */
  expired: () => boolean;
  /** Clears the timer and the listener on the caller's signal; call it once the request settles. */
  dispose: () => void;
};

/**
 * @param callerSignal - The caller's own cancellation, when it has one.
 * @param timeoutMs - The wait allowed for the response.
 * @returns A signal that follows the caller and the deadline, plus whether the deadline fired.
 */
export function startBrowserRequestDeadline(callerSignal?: AbortSignal, timeoutMs = BROWSER_REQUEST_TIMEOUT_MS): BrowserRequestDeadline {
  const controller = new AbortController();
  let deadlineFired = false;
  const followCaller = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) followCaller();
  else callerSignal?.addEventListener("abort", followCaller, { once: true });

  const timer = setTimeout(() => {
    if (controller.signal.aborted) return;
    deadlineFired = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    expired: () => deadlineFired,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", followCaller);
    },
  };
}

/** The result every adapter returns when its caller cancelled the request. */
export type AbortedBrowserRequest = { status: "aborted" };

/**
 * Runs one adapter call under the deadline and turns an abort caused by the deadline into the adapter's own timeout
 * result. The caller's cancellation stays an abort.
 *
 * @param callerSignal - The caller's own cancellation.
 * @param call - The call, run with a signal that also follows the deadline.
 * @param timedOut - Builds the adapter's timeout result; a write keeps it uncertain because it may have committed.
 * @returns The call's result, or the timeout result when the response never arrived.
 */
export async function boundBrowserRequest<Result extends { status: string }>(callerSignal: AbortSignal, call: (signal: AbortSignal) => Promise<Result>, timedOut: () => Result): Promise<Result | AbortedBrowserRequest> {
  // An already cancelled caller never reaches the transport.
  if (callerSignal.aborted) return { status: "aborted" };
  const deadline = startBrowserRequestDeadline(callerSignal);
  try {
    const result = await call(deadline.signal);
    return result.status === "aborted" && deadline.expired() && !callerSignal.aborted ? timedOut() : result;
  } finally {
    deadline.dispose();
  }
}
