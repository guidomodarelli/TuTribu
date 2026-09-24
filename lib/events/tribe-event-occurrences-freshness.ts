import { planFreshnessReadRetry } from "@/lib/events/tribe-event-read-retry";

/**
 * Pure state machine that decides when the calendar reads the occurrences of
 * the visible month again. `useTribeEventMutations` feeds it every creation,
 * edit, deletion, attendance answer, month read, and new server render, and
 * executes the commands it emits (start or abort the read, schedule or cancel
 * a delayed retry).
 *
 * Each mutation still applies its own minimal response right away. Those
 * responses carry attendance summaries read inside their own transaction, so
 * when two of them overlap (for example an edit and an attendance answer on
 * the same occurrence) nothing tells which one committed last: an edit can
 * read its summaries before the answer commits and still answer after it, or
 * the other way around. Instead of ordering responses, any overlap makes a
 * single read of the visible month required once every pending mutation
 * settles; that read is the source of truth.
 *
 * Invariants it guarantees by construction:
 * - A read never overlaps an uncommitted mutation: starting a mutation aborts
 *   the read in flight and makes it required again.
 * - A mutation that was pending alone and settled `applied` or `rejected`
 *   never triggers a read: an applied response is the committed state of what
 *   it touched, and a rejection stored nothing.
 * - A mutation that settled `ambiguous` (network failure, timeout, unreadable
 *   body, or 5xx) may have committed without its response reaching the
 *   screen, so it makes the read required even when it was pending alone.
 * - A new server render that arrives while a mutation is pending may predate
 *   its commit, and the pending response is applied on top of the previous
 *   render (so the new one discards it): the read becomes required. A render
 *   that arrives while a read is in flight restarts it against the new render.
 * - A read that settles without usable data (an error status, an unusable
 *   body, or a network failure) keeps the occurrences on screen, which may
 *   still show an overlapped response that is out of date, so it retries with
 *   the bounded `FRESHNESS_READ_RETRY_DELAYS_MS` backoff (the same one the
 *   streak uses) and then stops. A successful read resets it and any read that
 *   starts earlier (another overlap) cancels the scheduled retry. An aborted
 *   read is never reported, so it never counts as a failure: the mutation
 *   that aborted it makes the read required again.
 * - A retry that comes due while a mutation is pending waits for every
 *   pending mutation to settle, so it never overlaps an uncommitted one.
 * - A new server render replaces the local occurrences, so it forgets the
 *   failed read retries of the previous render and cancels the scheduled one.
 * - Once disposed (the calendar unmounted) it aborts the read in flight,
 *   cancels the scheduled retry, and ignores every later event.
 */

/** Inputs of the state machine. */
export const OCCURRENCES_FRESHNESS_EVENT = {
  disposed: "disposed",
  mutationSettled: "mutation-settled",
  mutationStarted: "mutation-started",
  readRetryDue: "read-retry-due",
  readSettled: "read-settled",
  sourceChanged: "source-changed",
} as const;

/** Side effects the hook executes. */
export const OCCURRENCES_FRESHNESS_COMMAND = {
  abortRead: "abort-read",
  cancelScheduledRead: "cancel-scheduled-read",
  scheduleRead: "schedule-read",
  startRead: "start-read",
} as const;

/**
 * How a mutation settled: `applied` when its successful response landed on
 * screen, `rejected` when the route answered with a non-success status and a
 * readable body (nothing was stored), and `ambiguous` when it may have
 * committed without a usable response (network failure, timeout, unreadable
 * body, or 5xx).
 */
export const OCCURRENCES_MUTATION_OUTCOME = {
  ambiguous: "ambiguous",
  applied: "applied",
  rejected: "rejected",
} as const;

/** How a mutation settled. */
export type OccurrencesMutationOutcome =
  (typeof OCCURRENCES_MUTATION_OUTCOME)[keyof typeof OCCURRENCES_MUTATION_OUTCOME];

/**
 * How a read that was not aborted settled: `succeeded` when it returned usable
 * occurrences, `failed` when it returned an error status, an unusable body, or
 * never got an answer.
 */
export const OCCURRENCES_READ_OUTCOME = {
  failed: "failed",
  succeeded: "succeeded",
} as const;

/** How a read that was not aborted settled. */
export type OccurrencesReadOutcome =
  (typeof OCCURRENCES_READ_OUTCOME)[keyof typeof OCCURRENCES_READ_OUTCOME];

/** Freshness state of the occurrences on screen. */
export type OccurrencesFreshnessState = {
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
   * when every pending mutation settles.
   */
  isMutationBatchOverlapped: boolean;
  isReadInFlight: boolean;
  /** True when a read must run once every pending mutation settles. */
  isReadRequired: boolean;
  /** True while the hook holds a delayed retry of a failed read. */
  isReadRetryScheduled: boolean;
  pendingMutationCount: number;
};

/** Input of the state machine. */
export type OccurrencesFreshnessEvent =
  | { type: typeof OCCURRENCES_FRESHNESS_EVENT.disposed }
  | {
      outcome: OccurrencesMutationOutcome;
      type: typeof OCCURRENCES_FRESHNESS_EVENT.mutationSettled;
    }
  | { type: typeof OCCURRENCES_FRESHNESS_EVENT.mutationStarted }
  | { type: typeof OCCURRENCES_FRESHNESS_EVENT.readRetryDue }
  | { outcome: OccurrencesReadOutcome; type: typeof OCCURRENCES_FRESHNESS_EVENT.readSettled }
  | { type: typeof OCCURRENCES_FRESHNESS_EVENT.sourceChanged };

/** Side effect the hook executes, in emission order. */
export type OccurrencesFreshnessCommand =
  | { type: typeof OCCURRENCES_FRESHNESS_COMMAND.abortRead }
  | { type: typeof OCCURRENCES_FRESHNESS_COMMAND.cancelScheduledRead }
  | { delayMs: number; type: typeof OCCURRENCES_FRESHNESS_COMMAND.scheduleRead }
  | { type: typeof OCCURRENCES_FRESHNESS_COMMAND.startRead };

/** Next state plus the commands a transition emitted. */
export type OccurrencesFreshnessTransition = {
  commands: OccurrencesFreshnessCommand[];
  state: OccurrencesFreshnessState;
};

export const INITIAL_OCCURRENCES_FRESHNESS_STATE: OccurrencesFreshnessState = {
  failedReadRetryCount: 0,
  isDisposed: false,
  isMutationBatchOverlapped: false,
  isReadInFlight: false,
  isReadRequired: false,
  isReadRetryScheduled: false,
  pendingMutationCount: 0,
};

/**
 * Starts the read of the visible month, cancelling the scheduled retry first
 * because this read supersedes it.
 */
function startRead(state: OccurrencesFreshnessState): OccurrencesFreshnessTransition {
  const commands: OccurrencesFreshnessCommand[] = state.isReadRetryScheduled
    ? [{ type: OCCURRENCES_FRESHNESS_COMMAND.cancelScheduledRead }]
    : [];

  return {
    commands: [...commands, { type: OCCURRENCES_FRESHNESS_COMMAND.startRead }],
    state: { ...state, isReadInFlight: true, isReadRetryScheduled: false },
  };
}

function startMutation(state: OccurrencesFreshnessState): OccurrencesFreshnessTransition {
  const nextState: OccurrencesFreshnessState = {
    ...state,
    isMutationBatchOverlapped: state.isMutationBatchOverlapped || state.pendingMutationCount > 0,
    isReadInFlight: false,
    isReadRequired: state.isReadRequired || state.isReadInFlight,
    pendingMutationCount: state.pendingMutationCount + 1,
  };

  return state.isReadInFlight
    ? { commands: [{ type: OCCURRENCES_FRESHNESS_COMMAND.abortRead }], state: nextState }
    : { commands: [], state: nextState };
}

/**
 * Settles one mutation; once none is pending, runs the read an overlap, an
 * ambiguous outcome, an interrupted read, or a new server render made
 * required.
 */
function settleMutation(
  state: OccurrencesFreshnessState,
  outcome: OccurrencesMutationOutcome
): OccurrencesFreshnessTransition {
  const pendingMutationCount = Math.max(state.pendingMutationCount - 1, 0);
  const isReadRequired =
    state.isReadRequired ||
    state.isMutationBatchOverlapped ||
    outcome === OCCURRENCES_MUTATION_OUTCOME.ambiguous;

  if (pendingMutationCount > 0) {
    return { commands: [], state: { ...state, isReadRequired, pendingMutationCount } };
  }

  const settledState: OccurrencesFreshnessState = {
    ...state,
    isMutationBatchOverlapped: false,
    isReadRequired: false,
    pendingMutationCount,
  };

  return isReadRequired ? startRead(settledState) : { commands: [], state: settledState };
}

/**
 * Settles the read in flight. A successful one resets the failed read
 * retries; a failed one schedules the next delay of the bounded backoff, or
 * stops (and resets the count) once the retries run out.
 */
function settleRead(
  state: OccurrencesFreshnessState,
  outcome: OccurrencesReadOutcome
): OccurrencesFreshnessTransition {
  const settledState: OccurrencesFreshnessState = { ...state, isReadInFlight: false };

  if (outcome === OCCURRENCES_READ_OUTCOME.succeeded) {
    return { commands: [], state: { ...settledState, failedReadRetryCount: 0 } };
  }

  const retry = planFreshnessReadRetry(state.failedReadRetryCount);

  if (retry === null) {
    return { commands: [], state: { ...settledState, failedReadRetryCount: 0 } };
  }

  return {
    commands: [{ delayMs: retry.delayMs, type: OCCURRENCES_FRESHNESS_COMMAND.scheduleRead }],
    state: {
      ...settledState,
      failedReadRetryCount: retry.retryCount,
      isReadRetryScheduled: true,
    },
  };
}

/**
 * Runs the retry the hook held: it starts now when no mutation is pending,
 * and otherwise becomes a required read that runs once every mutation
 * settles. A retry that is no longer scheduled (superseded, or cancelled by a
 * new server render) is ignored.
 */
function runDueRetry(state: OccurrencesFreshnessState): OccurrencesFreshnessTransition {
  if (!state.isReadRetryScheduled) {
    return { commands: [], state };
  }

  const dueState: OccurrencesFreshnessState = { ...state, isReadRetryScheduled: false };

  if (state.pendingMutationCount > 0) {
    return { commands: [], state: { ...dueState, isReadRequired: true } };
  }

  return startRead(dueState);
}

/**
 * Handles a new server render: it forgets the failed read retries of the
 * previous render (cancelling the scheduled one); with a mutation pending the
 * read becomes required; with a read in flight (it belongs to the previous
 * render) it restarts against the new one.
 */
function changeSource(state: OccurrencesFreshnessState): OccurrencesFreshnessTransition {
  const commands: OccurrencesFreshnessCommand[] = state.isReadRetryScheduled
    ? [{ type: OCCURRENCES_FRESHNESS_COMMAND.cancelScheduledRead }]
    : [];
  const sourceState: OccurrencesFreshnessState = {
    ...state,
    failedReadRetryCount: 0,
    isReadRetryScheduled: false,
  };

  if (state.pendingMutationCount > 0) {
    return { commands, state: { ...sourceState, isReadRequired: true } };
  }

  return state.isReadInFlight
    ? {
        commands: [
          ...commands,
          { type: OCCURRENCES_FRESHNESS_COMMAND.abortRead },
          { type: OCCURRENCES_FRESHNESS_COMMAND.startRead },
        ],
        state: sourceState,
      }
    : { commands, state: sourceState };
}

/**
 * Computes the next freshness state of the occurrences and the commands to run.
 *
 * @param state - Current state.
 * @param event - Mutation, read, due retry, new server render, or unmount.
 * @returns The next state and the ordered commands for the hook; no command
 * once the state machine was disposed.
 */
export function transitionOccurrencesFreshness(
  state: OccurrencesFreshnessState,
  event: OccurrencesFreshnessEvent
): OccurrencesFreshnessTransition {
  if (state.isDisposed) {
    return { commands: [], state };
  }

  switch (event.type) {
    case OCCURRENCES_FRESHNESS_EVENT.mutationStarted:
      return startMutation(state);
    case OCCURRENCES_FRESHNESS_EVENT.mutationSettled:
      return settleMutation(state, event.outcome);
    case OCCURRENCES_FRESHNESS_EVENT.readSettled:
      return settleRead(state, event.outcome);
    case OCCURRENCES_FRESHNESS_EVENT.readRetryDue:
      return runDueRetry(state);
    case OCCURRENCES_FRESHNESS_EVENT.sourceChanged:
      return changeSource(state);
    case OCCURRENCES_FRESHNESS_EVENT.disposed:
      return {
        commands: [
          { type: OCCURRENCES_FRESHNESS_COMMAND.abortRead },
          { type: OCCURRENCES_FRESHNESS_COMMAND.cancelScheduledRead },
        ],
        state: {
          ...state,
          failedReadRetryCount: 0,
          isDisposed: true,
          isReadInFlight: false,
          isReadRequired: false,
          isReadRetryScheduled: false,
        },
      };
  }
}
