import type { vi } from "vitest";

/**
 * Fake timer options for suites that render Motion animations.
 *
 * jsdom drives `requestAnimationFrame` with a Node `setInterval`. Faking
 * `setInterval` hands that interval to the fake clock, and restoring real
 * timers while an animation frame is pending drops it for good: jsdom then
 * never schedules another frame, so every later presence transition in the
 * file (dialogs closing, lists removing items, content swaps) stalls. Only
 * the clock and one-shot timers are faked, which is all the event suites
 * need for fixed dates, debounces and `advanceTimersByTime`.
 */
export const MOTION_SAFE_FAKE_TIMERS: NonNullable<Parameters<typeof vi.useFakeTimers>[0]> = {
  shouldAdvanceTime: true,
  toFake: ["Date", "setTimeout", "clearTimeout"],
};
