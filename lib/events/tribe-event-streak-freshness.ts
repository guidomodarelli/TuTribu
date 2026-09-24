import { readAttendanceStreakNextRefreshTime } from "@/lib/events/tribe-event-attendance-streak-dto";

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
 * - An interrupted read is only covered by a committed streak when a single
 *   mutation was pending the whole time; any overlapping mutation makes the
 *   read required, so it runs once every mutation settles.
 * - A returned next refresh instant that already passed reads right away the
 *   first time, then retries with the bounded `STREAK_DEADLINE_RETRY_DELAYS_MS`
 *   backoff while the server keeps returning it (its clock may lag behind the
 *   browser), and finally stops, so it never loops.
 */

/**
 * Delays of the retries of a passed next refresh instant that the server keeps
 * returning, in order. Their length bounds the retries.
 */
const FIRST_DEADLINE_RETRY_DELAY_MS = 5_000;
const SECOND_DEADLINE_RETRY_DELAY_MS = 15_000;
const THIRD_DEADLINE_RETRY_DELAY_MS = 45_000;

export const STREAK_DEADLINE_RETRY_DELAYS_MS = [
  FIRST_DEADLINE_RETRY_DELAY_MS,
  SECOND_DEADLINE_RETRY_DELAY_MS,
  THIRD_DEADLINE_RETRY_DELAY_MS,
] as const;

/** Read that must run once every pending mutation settles. */
export const STREAK_PENDING_READ = {
  coverable: "coverable",
  none: "none",
  required: "required",
} as const;

/** Inputs of the state machine. */
export const STREAK_FRESHNESS_EVENT = {
  deadlineReturned: "deadline-returned",
  mutationSettled: "mutation-settled",
  mutationStarted: "mutation-started",
  readRequested: "read-requested",
  readSettled: "read-settled",
  sourceChanged: "source-changed",
} as const;

/** Side effects the hook executes. */
export const STREAK_FRESHNESS_COMMAND = {
  abortRead: "abort-read",
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

/** Passed next refresh instant already handled, with the retries it used. */
export type StreakPassedDeadline = {
  nextRefreshAt: string;
  retryCount: number;
};

/** Freshness state of the streak on screen. */
export type StreakFreshnessState = {
  isReadInFlight: boolean;
  passedDeadline: StreakPassedDeadline | null;
  pendingMutationCount: number;
  pendingRead: StreakPendingRead;
};

/** Input of the state machine. */
export type StreakFreshnessEvent =
  | { type: typeof STREAK_FRESHNESS_EVENT.readRequested }
  | { type: typeof STREAK_FRESHNESS_EVENT.readSettled }
  | { type: typeof STREAK_FRESHNESS_EVENT.mutationStarted }
  | { hasCommittedStreak: boolean; type: typeof STREAK_FRESHNESS_EVENT.mutationSettled }
  | {
      nextRefreshAt: string | null;
      nowTime: number;
      type: typeof STREAK_FRESHNESS_EVENT.deadlineReturned;
    }
  | { type: typeof STREAK_FRESHNESS_EVENT.sourceChanged };

/** Side effect the hook executes, in emission order. */
export type StreakFreshnessCommand =
  | { type: typeof STREAK_FRESHNESS_COMMAND.abortRead }
  | { type: typeof STREAK_FRESHNESS_COMMAND.cancelScheduledRead }
  | { delayMs: number; type: typeof STREAK_FRESHNESS_COMMAND.scheduleRead }
  | { type: typeof STREAK_FRESHNESS_COMMAND.startRead };

/** Next state plus the commands a transition emitted. */
export type StreakFreshnessTransition = {
  commands: StreakFreshnessCommand[];
  state: StreakFreshnessState;
};

export const INITIAL_STREAK_FRESHNESS_STATE: StreakFreshnessState = {
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

  if (state.isReadInFlight) {
    return {
      commands: [{ type: STREAK_FRESHNESS_COMMAND.abortRead }],
      state: { ...state, isReadInFlight: false, pendingMutationCount, pendingRead: STREAK_PENDING_READ.coverable },
    };
  }

  // A second overlapping mutation can commit after the first one computed its
  // streak, so that streak can no longer cover the interrupted read.
  const pendingRead: StreakPendingRead =
    state.pendingRead === STREAK_PENDING_READ.coverable ? STREAK_PENDING_READ.required : state.pendingRead;

  return { commands: [], state: { ...state, pendingMutationCount, pendingRead } };
}

function settleMutation(
  state: StreakFreshnessState,
  hasCommittedStreak: boolean
): StreakFreshnessTransition {
  const pendingMutationCount = Math.max(state.pendingMutationCount - 1, 0);
  const pendingRead: StreakPendingRead =
    hasCommittedStreak && state.pendingRead === STREAK_PENDING_READ.coverable ? STREAK_PENDING_READ.none : state.pendingRead;
  const settledState = { ...state, pendingMutationCount, pendingRead };

  if (pendingMutationCount > 0 || pendingRead === STREAK_PENDING_READ.none) {
    return { commands: [], state: settledState };
  }

  return requestRead(settledState);
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
    const delayMs = STREAK_DEADLINE_RETRY_DELAYS_MS[trackedDeadline.retryCount];

    if (delayMs === undefined) {
      return { commands: [], state };
    }

    return {
      commands: [{ delayMs, type: STREAK_FRESHNESS_COMMAND.scheduleRead }],
      state: {
        ...state,
        passedDeadline: { nextRefreshAt, retryCount: trackedDeadline.retryCount + 1 },
      },
    };
  }

  const read = requestRead({ ...state, passedDeadline: { nextRefreshAt, retryCount: 0 } });

  return trackedDeadline === null
    ? read
    : { commands: [{ type: STREAK_FRESHNESS_COMMAND.cancelScheduledRead }, ...read.commands], state: read.state };
}

/**
 * Computes the next freshness state of the streak and the commands to run.
 *
 * @param state - Current state.
 * @param event - Read, mutation, returned instant, or new server render.
 * @returns The next state and the ordered commands for the hook.
 */
export function transitionStreakFreshness(
  state: StreakFreshnessState,
  event: StreakFreshnessEvent
): StreakFreshnessTransition {
  switch (event.type) {
    case STREAK_FRESHNESS_EVENT.readRequested:
      return requestRead(state);
    case STREAK_FRESHNESS_EVENT.readSettled:
      return { commands: [], state: { ...state, isReadInFlight: false } };
    case STREAK_FRESHNESS_EVENT.mutationStarted:
      return startMutation(state);
    case STREAK_FRESHNESS_EVENT.mutationSettled:
      return settleMutation(state, event.hasCommittedStreak);
    case STREAK_FRESHNESS_EVENT.deadlineReturned:
      return handleReturnedDeadline(state, event.nextRefreshAt, event.nowTime);
    case STREAK_FRESHNESS_EVENT.sourceChanged:
      return state.passedDeadline === null
        ? { commands: [], state }
        : {
            commands: [{ type: STREAK_FRESHNESS_COMMAND.cancelScheduledRead }],
            state: { ...state, passedDeadline: null },
          };
  }
}
