import { readAttendanceStreakNextRefreshTime } from "@/lib/events/tribe-event-attendance-streak-dto";
import { planFreshnessReadRetry } from "@/lib/events/tribe-event-read-retry";

/**
 * Pure state machine that decides when the calendar reads the viewer streak
 * again. `useTribeEventMutations` feeds it every read, mutation, returned
 * next refresh instant, and new server render, and executes the commands it
 * emits (start or abort the read, schedule or cancel a delayed read).
 *
 * Invariants it guarantees by construction:
 * - A read never overlaps an uncommitted mutation: starting a mutation aborts
 *   the read in flight and a read requested while mutations are pending waits
 *   until the count returns to zero.
 * - The streak and next refresh instant a mutation response carries are only
 *   applied (`apply-mutation-streak`) when that mutation was pending alone for
 *   its whole cycle and the response carried both fields. Any other outcome
 *   (another series or attendance mutation overlapped, a field was omitted, or
 *   the series mutation failed) makes the read required, and a single read
 *   runs once every pending mutation settles. That read is the source of
 *   truth, so responses never need to be ordered by start or by commit.
 * - A lone mutation that interrupted a read in flight covers it when its
 *   response is applied, because it committed after the read started.
 * - A returned next refresh instant that already passed reads right away the
 *   first time, then retries with the bounded `FRESHNESS_READ_RETRY_DELAYS_MS`
 *   backoff while the server keeps returning it (its clock may lag behind the
 *   browser), and finally stops, so it never loops.
 * - A read that settles without usable data (an error status, an unusable
 *   body, or a network failure) retries with the same bounded backoff and then
 *   stops; a successful read resets it. An aborted read is never reported, so
 *   it never counts as a failure.
 * - A partial read (it returned the streak but not a usable next refresh
 *   instant, because the route could not compute it) shares that backoff: the
 *   hook applies its streak, but the instant on screen may already have
 *   passed, so the read is retried until one returns the instant or the
 *   retries run out.
 * - A new server render that arrives while a mutation is pending may carry
 *   the pre-commit streak, and the pending mutation's response is tagged with
 *   the previous render, so the hook ignores it: the read becomes required and
 *   runs once every pending mutation settles.
 * - Once disposed (the calendar unmounted) it aborts the read in flight,
 *   cancels the scheduled one, and ignores every later event, so a mutation
 *   that settles after the unmount never starts or schedules a read.
 */

/** Read that must run once every pending mutation settles. */
export const STREAK_PENDING_READ = {
  coverable: "coverable",
  none: "none",
  required: "required",
} as const;

/**
 * What a settled mutation tells about the streak: `carried` when a successful
 * series mutation returned both the streak and its next refresh instant,
 * `missing` when a series mutation failed or omitted either field, and
 * `unaffected` for attendance answers, which never carry the streak.
 */
export const STREAK_MUTATION_OUTCOME = {
  carried: "carried",
  missing: "missing",
  unaffected: "unaffected",
} as const;

/**
 * How a read that was not aborted settled: `succeeded` when it returned a
 * usable streak and next refresh instant, `partial` when it returned a usable
 * streak without a usable next refresh instant, `failed` when it returned an
 * error status, an unusable body, or never got an answer.
 */
export const STREAK_READ_OUTCOME = {
  failed: "failed",
  partial: "partial",
  succeeded: "succeeded",
} as const;

/** Inputs of the state machine. */
export const STREAK_FRESHNESS_EVENT = {
  deadlineReturned: "deadline-returned",
  disposed: "disposed",
  mutationSettled: "mutation-settled",
  mutationStarted: "mutation-started",
  readRequested: "read-requested",
  readSettled: "read-settled",
  sourceChanged: "source-changed",
} as const;

/** Side effects the hook executes. */
export const STREAK_FRESHNESS_COMMAND = {
  abortRead: "abort-read",
  applyMutationStreak: "apply-mutation-streak",
  cancelScheduledRead: "cancel-scheduled-read",
  scheduleRead: "schedule-read",
  startRead: "start-read",
} as const;

/**
 * Read that must run once every pending mutation settles: `coverable` when a
 * single mutation interrupted a read in flight (its committed streak covers
 * it), `required` when it must run regardless.
 */
export type StreakPendingRead = (typeof STREAK_PENDING_READ)[keyof typeof STREAK_PENDING_READ];

/** How a read that was not aborted settled. */
export type StreakReadOutcome = (typeof STREAK_READ_OUTCOME)[keyof typeof STREAK_READ_OUTCOME];

/** What a settled mutation tells about the streak. */
export type StreakMutationOutcome =
  (typeof STREAK_MUTATION_OUTCOME)[keyof typeof STREAK_MUTATION_OUTCOME];

/** Passed next refresh instant already handled, with the retries it used. */
export type StreakPassedDeadline = {
  nextRefreshAt: string;
  retryCount: number;
};

/** Freshness state of the streak on screen. */
export type StreakFreshnessState = {
  /**
   * Retries already scheduled for reads that settled without usable data in
   * a row. It resets on a successful read, a new server render, and once the
   * retries run out.
   */
  failedReadRetryCount: number;
  /** True once the calendar unmounted: every later event is ignored. */
  isDisposed: boolean;
  /**
   * True once a mutation started while another one was pending; it resets
   * when every pending mutation settles. While true, no response of the
   * current batch of mutations is applied.
   */
  isMutationBatchOverlapped: boolean;
  isReadInFlight: boolean;
  passedDeadline: StreakPassedDeadline | null;
  pendingMutationCount: number;
  pendingRead: StreakPendingRead;
};

/** Input of the state machine. */
export type StreakFreshnessEvent =
  | { type: typeof STREAK_FRESHNESS_EVENT.readRequested }
  | { outcome: StreakReadOutcome; type: typeof STREAK_FRESHNESS_EVENT.readSettled }
  | { type: typeof STREAK_FRESHNESS_EVENT.mutationStarted }
  | { outcome: StreakMutationOutcome; type: typeof STREAK_FRESHNESS_EVENT.mutationSettled }
  | {
      nextRefreshAt: string | null;
      nowTime: number;
      type: typeof STREAK_FRESHNESS_EVENT.deadlineReturned;
    }
  | { type: typeof STREAK_FRESHNESS_EVENT.sourceChanged }
  | { type: typeof STREAK_FRESHNESS_EVENT.disposed };

/** Side effect the hook executes, in emission order. */
export type StreakFreshnessCommand =
  | { type: typeof STREAK_FRESHNESS_COMMAND.abortRead }
  | { type: typeof STREAK_FRESHNESS_COMMAND.applyMutationStreak }
  | { type: typeof STREAK_FRESHNESS_COMMAND.cancelScheduledRead }
  | { delayMs: number; type: typeof STREAK_FRESHNESS_COMMAND.scheduleRead }
  | { type: typeof STREAK_FRESHNESS_COMMAND.startRead };

/** Next state plus the commands a transition emitted. */
export type StreakFreshnessTransition = {
  commands: StreakFreshnessCommand[];
  state: StreakFreshnessState;
};

export const INITIAL_STREAK_FRESHNESS_STATE: StreakFreshnessState = {
  failedReadRetryCount: 0,
  isDisposed: false,
  isMutationBatchOverlapped: false,
  isReadInFlight: false,
  passedDeadline: null,
  pendingMutationCount: 0,
  pendingRead: STREAK_PENDING_READ.none,
};

/**
 * Requests a read: it starts now when no mutation is pending, and otherwise
 * becomes a required read that runs once every mutation settles.
 */
function requestRead(state: StreakFreshnessState): StreakFreshnessTransition {
  if (state.pendingMutationCount > 0) {
    return { commands: [], state: { ...state, pendingRead: STREAK_PENDING_READ.required } };
  }

  return {
    commands: [{ type: STREAK_FRESHNESS_COMMAND.startRead }],
    state: { ...state, isReadInFlight: true, pendingRead: STREAK_PENDING_READ.none },
  };
}

function startMutation(state: StreakFreshnessState): StreakFreshnessTransition {
  const pendingMutationCount = state.pendingMutationCount + 1;
  const isMutationBatchOverlapped =
    state.isMutationBatchOverlapped || state.pendingMutationCount > 0;

  if (state.isReadInFlight) {
    return {
      commands: [{ type: STREAK_FRESHNESS_COMMAND.abortRead }],
      state: {
        ...state,
        isMutationBatchOverlapped,
        isReadInFlight: false,
        pendingMutationCount,
        pendingRead: STREAK_PENDING_READ.coverable,
      },
    };
  }

  return { commands: [], state: { ...state, isMutationBatchOverlapped, pendingMutationCount } };
}

/**
 * Decides what the read still owed becomes once a mutation settles, and
 * whether its response can be applied: only a lone mutation that carried
 * both fields applies them (and covers the read it interrupted); a series
 * mutation that overlapped another one, omitted a field, or failed requires
 * the read; an attendance answer leaves the owed read as it was.
 */
function settleMutation(
  state: StreakFreshnessState,
  outcome: StreakMutationOutcome
): StreakFreshnessTransition {
  const pendingMutationCount = Math.max(state.pendingMutationCount - 1, 0);
  const canApplyResponse =
    outcome === STREAK_MUTATION_OUTCOME.carried && !state.isMutationBatchOverlapped;
  let pendingRead = state.pendingRead;

  if (canApplyResponse) {
    pendingRead = pendingRead === STREAK_PENDING_READ.coverable ? STREAK_PENDING_READ.none : pendingRead;
  } else if (outcome !== STREAK_MUTATION_OUTCOME.unaffected) {
    pendingRead = STREAK_PENDING_READ.required;
  }

  const commands: StreakFreshnessCommand[] = canApplyResponse
    ? [{ type: STREAK_FRESHNESS_COMMAND.applyMutationStreak }]
    : [];
  const settledState: StreakFreshnessState = {
    ...state,
    isMutationBatchOverlapped: pendingMutationCount > 0 && state.isMutationBatchOverlapped,
    pendingMutationCount,
    pendingRead,
  };

  if (pendingMutationCount > 0 || pendingRead === STREAK_PENDING_READ.none) {
    return { commands, state: settledState };
  }

  const read = requestRead(settledState);

  return { commands: [...commands, ...read.commands], state: read.state };
}

function handleReturnedDeadline(
  state: StreakFreshnessState,
  nextRefreshAt: string | null,
  nowTime: number
): StreakFreshnessTransition {
  const nextRefreshTime = readAttendanceStreakNextRefreshTime(nextRefreshAt);
  const trackedDeadline = state.passedDeadline;

  if (nextRefreshAt === null || nextRefreshTime === null || nextRefreshTime > nowTime) {
    return trackedDeadline === null
      ? { commands: [], state }
      : { commands: [{ type: STREAK_FRESHNESS_COMMAND.cancelScheduledRead }], state: { ...state, passedDeadline: null } };
  }

  if (trackedDeadline?.nextRefreshAt === nextRefreshAt) {
    const retry = planFreshnessReadRetry(trackedDeadline.retryCount);

    if (retry === null) {
      return { commands: [], state };
    }

    return {
      commands: [{ delayMs: retry.delayMs, type: STREAK_FRESHNESS_COMMAND.scheduleRead }],
      state: {
        ...state,
        passedDeadline: { nextRefreshAt, retryCount: retry.retryCount },
      },
    };
  }

  const read = requestRead({ ...state, passedDeadline: { nextRefreshAt, retryCount: 0 } });

  return trackedDeadline === null
    ? read
    : { commands: [{ type: STREAK_FRESHNESS_COMMAND.cancelScheduledRead }, ...read.commands], state: read.state };
}

/**
 * Settles the read in flight. A successful one cancels the retry a previous
 * failure scheduled; a failed or partial one schedules the next delay of the
 * bounded backoff, or stops (and resets the count) once the retries run out.
 */
function settleRead(
  state: StreakFreshnessState,
  outcome: StreakReadOutcome
): StreakFreshnessTransition {
  const settledState: StreakFreshnessState = { ...state, isReadInFlight: false };

  if (outcome === STREAK_READ_OUTCOME.succeeded) {
    return state.failedReadRetryCount === 0
      ? { commands: [], state: settledState }
      : {
          commands: [{ type: STREAK_FRESHNESS_COMMAND.cancelScheduledRead }],
          state: { ...settledState, failedReadRetryCount: 0 },
        };
  }

  const retry = planFreshnessReadRetry(state.failedReadRetryCount);

  if (retry === null) {
    return { commands: [], state: { ...settledState, failedReadRetryCount: 0 } };
  }

  return {
    commands: [{ delayMs: retry.delayMs, type: STREAK_FRESHNESS_COMMAND.scheduleRead }],
    state: { ...settledState, failedReadRetryCount: retry.retryCount },
  };
}

/**
 * Forgets the passed deadline and the failed read retries of the previous
 * server render, cancelling the read either of them scheduled. When a
 * mutation is still pending, the new render may predate its commit and its
 * response will be tagged with the previous render (so the hook drops it):
 * the read becomes required once every pending mutation settles.
 */
function changeSource(state: StreakFreshnessState): StreakFreshnessTransition {
  const pendingRead =
    state.pendingMutationCount > 0 ? STREAK_PENDING_READ.required : state.pendingRead;
  const sourceState: StreakFreshnessState = { ...state, pendingRead };

  if (state.passedDeadline === null && state.failedReadRetryCount === 0) {
    return { commands: [], state: sourceState };
  }

  return {
    commands: [{ type: STREAK_FRESHNESS_COMMAND.cancelScheduledRead }],
    state: { ...sourceState, failedReadRetryCount: 0, passedDeadline: null },
  };
}

/**
 * Disposes the state machine: aborts the read in flight and cancels the
 * scheduled one. Later events are ignored by `transitionStreakFreshness`.
 */
function dispose(state: StreakFreshnessState): StreakFreshnessTransition {
  return {
    commands: [
      { type: STREAK_FRESHNESS_COMMAND.abortRead },
      { type: STREAK_FRESHNESS_COMMAND.cancelScheduledRead },
    ],
    state: {
      ...state,
      failedReadRetryCount: 0,
      isDisposed: true,
      isReadInFlight: false,
      passedDeadline: null,
      pendingRead: STREAK_PENDING_READ.none,
    },
  };
}

/**
 * Computes the next freshness state of the streak and the commands to run.
 *
 * @param state - Current state.
 * @param event - Read, mutation, returned instant, new server render, or unmount.
 * @returns The next state and the ordered commands for the hook; no command
 * once the state machine was disposed.
 */
export function transitionStreakFreshness(
  state: StreakFreshnessState,
  event: StreakFreshnessEvent
): StreakFreshnessTransition {
  if (state.isDisposed) {
    return { commands: [], state };
  }

  switch (event.type) {
    case STREAK_FRESHNESS_EVENT.readRequested:
      return requestRead(state);
    case STREAK_FRESHNESS_EVENT.readSettled:
      return settleRead(state, event.outcome);
    case STREAK_FRESHNESS_EVENT.mutationStarted:
      return startMutation(state);
    case STREAK_FRESHNESS_EVENT.mutationSettled:
      return settleMutation(state, event.outcome);
    case STREAK_FRESHNESS_EVENT.deadlineReturned:
      return handleReturnedDeadline(state, event.nextRefreshAt, event.nowTime);
    case STREAK_FRESHNESS_EVENT.sourceChanged:
      return changeSource(state);
    case STREAK_FRESHNESS_EVENT.disposed:
      return dispose(state);
  }
}
