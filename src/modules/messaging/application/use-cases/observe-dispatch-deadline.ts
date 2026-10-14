/** Observes exactly one original operation without retries or assumed cancellation. @module observe-dispatch-deadline */
/** A deadline ends observation while the original effect can still settle. */
export type ObservedWithinDeadline<Value> = { settled: true; value: Value } | { settled: false };
/** @param work - Already started original operation. @param durationMs - Remaining observation budget. @param expire - Optional abort for the same request. @returns Actual evidence or explicit deadline with late rejection handled. */
export async function observeWithin<Value>(work: Promise<Value>, durationMs: number, expire?: () => void): Promise<ObservedWithinDeadline<Value>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<ObservedWithinDeadline<Value>>((resolve) => { timer = setTimeout(() => { expire?.(); resolve({ settled: false }); }, Math.max(0, durationMs)); });
  try { return await Promise.race([work.then((value) => ({ settled: true as const, value })), deadline]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
