/**
 * Lets Sonner finish closing the toasts of each test while their toaster is still mounted.
 *
 * Sonner removes a closed toast 200 ms later with the global `setTimeout`, which Vitest's jsdom environment leaves as
 * Node's timer: `window.close()` does not cancel it. A removal still pending when a file ends fires after the jsdom
 * teardown, and React's `dispatchSetState` then throws `ReferenceError: window is not defined` as an unhandled error
 * that fails the whole shard even though every test passed. Settling every toast before Testing Library unmounts the
 * tree leaves no such timer behind.
 * @module toast-settling
 */
import { act, waitFor } from "@testing-library/react";
import { afterEach } from "vitest";

/** The live region every mounted Sonner toaster renders, with or without toasts. */
const SONNER_TOASTER_SELECTOR = "section[data-react-aria-top-layer]";
/** One toast still rendered, including one whose removal is pending. */
const SONNER_TOAST_SELECTOR = "[data-sonner-toast]";

/** Runs the timers Sonner schedules to add or update a toast, so toasts created at the end of a test reach the toaster. */
async function flushScheduledToasts(): Promise<void> {
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
}

/**
 * Closes every rendered toast and waits until Sonner has removed them, while the toaster is still mounted.
 * Does nothing when the test mounted no toaster or left no toast.
 */
async function settleToasts(): Promise<void> {
  if (!document.querySelector(SONNER_TOASTER_SELECTOR)) return;
  await flushScheduledToasts();
  if (!document.querySelector(SONNER_TOAST_SELECTOR)) return;
  const { toast } = await import("@golfo/ui");
  act(() => { toast.dismiss(); });
  await waitFor(() => {
    if (document.querySelector(SONNER_TOAST_SELECTOR)) throw new Error("Sonner is still removing the toasts of this test");
  });
}

/**
 * Registers `settleToasts` after every test. Importing this module first loads Testing Library, which registers its
 * own automatic cleanup; Vitest runs `afterEach` hooks in reverse registration order, so the toasts settle before the
 * tree is unmounted.
 */
export function installToastSettling(): void {
  afterEach(settleToasts);
}
