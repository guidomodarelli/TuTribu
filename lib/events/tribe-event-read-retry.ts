/**
 * Bounded backoff shared by the calendar freshness state machines (the viewer
 * streak in `tribe-event-streak-freshness.ts` and the visible month in
 * `tribe-event-occurrences-freshness.ts`). Each chain of retries walks these
 * delays in order and stops once they run out, so a read that keeps failing
 * never loops.
 */

const FIRST_READ_RETRY_DELAY_MS = 5_000;
const SECOND_READ_RETRY_DELAY_MS = 15_000;
const THIRD_READ_RETRY_DELAY_MS = 45_000;

/**
 * Delays, in order, of the retries of a freshness read. Their length bounds
 * each chain of retries.
 */
export const FRESHNESS_READ_RETRY_DELAYS_MS = [
  FIRST_READ_RETRY_DELAY_MS,
  SECOND_READ_RETRY_DELAY_MS,
  THIRD_READ_RETRY_DELAY_MS,
] as const;

/** Next retry of a chain: its delay and the retries used once it is scheduled. */
export type FreshnessReadRetry = {
  delayMs: number;
  retryCount: number;
};

/**
 * Plans the next retry of a chain.
 *
 * @param retryCount - Retries the chain already scheduled.
 * @returns The delay of the next retry and the updated count, or `null` once
 * every retry of the backoff was used.
 */
export function planFreshnessReadRetry(retryCount: number): FreshnessReadRetry | null {
  const delayMs = FRESHNESS_READ_RETRY_DELAYS_MS[retryCount];

  return delayMs === undefined ? null : { delayMs, retryCount: retryCount + 1 };
}

/** Transition of a freshness state machine after a failed read. */
export type FailedFreshnessReadTransition<TState, TScheduleReadType> = {
  /** The retry to schedule; empty once the backoff ran out. */
  commands: Array<{ delayMs: number; type: TScheduleReadType }>;
  state: TState;
};

/**
 * Settles a failed freshness read: schedules the next retry of the chain, or
 * resets the failed count once the retries run out so a later chain starts
 * from the first delay.
 *
 * @param settledState - State with the read already marked as finished.
 * @param failedReadRetryCount - Retries the current chain already scheduled.
 * @param scheduleReadType - Command type of the state machine that schedules a read.
 * @returns The state with the updated count and the retry command, if any.
 */
export function settleFailedFreshnessRead<
  TState extends { failedReadRetryCount: number },
  TScheduleReadType,
>(
  settledState: TState,
  failedReadRetryCount: number,
  scheduleReadType: TScheduleReadType
): FailedFreshnessReadTransition<TState, TScheduleReadType> {
  const retry = planFreshnessReadRetry(failedReadRetryCount);

  if (retry === null) {
    return { commands: [], state: { ...settledState, failedReadRetryCount: 0 } };
  }

  return {
    commands: [{ delayMs: retry.delayMs, type: scheduleReadType }],
    state: { ...settledState, failedReadRetryCount: retry.retryCount },
  };
}
