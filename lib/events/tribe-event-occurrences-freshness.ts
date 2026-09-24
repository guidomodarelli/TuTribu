/**
 * Pure state machine that decides when the calendar reads the occurrences of
 * the visible month again. `useTribeEventMutations` feeds it every creation,
 * edit, deletion, attendance answer, month read, and new server render, and
 * executes the commands it emits (start or abort the read).
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
 * - A mutation that was pending alone never triggers a read: its response is
 *   the committed state of what it touched.
 * - A new server render that arrives while a mutation is pending may predate
 *   its commit, and the pending response is applied on top of the previous
 *   render (so the new one discards it): the read becomes required. A render
 *   that arrives while a read is in flight restarts it against the new render.
 * - A failed read keeps the occurrences on screen; it is not retried, because
 *   every occurrence already shows the response of its own last mutation.
 * - Once disposed (the calendar unmounted) it aborts the read in flight and
 *   ignores every later event.
 */

/** Inputs of the state machine. */
export const OCCURRENCES_FRESHNESS_EVENT = {
  disposed: "disposed",
  mutationSettled: "mutation-settled",
  mutationStarted: "mutation-started",
  readSettled: "read-settled",
  sourceChanged: "source-changed",
} as const;

/** Side effects the hook executes. */
export const OCCURRENCES_FRESHNESS_COMMAND = {
  abortRead: "abort-read",
  startRead: "start-read",
} as const;

/** Freshness state of the occurrences on screen. */
export type OccurrencesFreshnessState = {
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
  pendingMutationCount: number;
};

/** Input of the state machine. */
export type OccurrencesFreshnessEvent = {
  type: (typeof OCCURRENCES_FRESHNESS_EVENT)[keyof typeof OCCURRENCES_FRESHNESS_EVENT];
};

/** Side effect the hook executes, in emission order. */
export type OccurrencesFreshnessCommand = {
  type: (typeof OCCURRENCES_FRESHNESS_COMMAND)[keyof typeof OCCURRENCES_FRESHNESS_COMMAND];
};

/** Next state plus the commands a transition emitted. */
export type OccurrencesFreshnessTransition = {
  commands: OccurrencesFreshnessCommand[];
  state: OccurrencesFreshnessState;
};

export const INITIAL_OCCURRENCES_FRESHNESS_STATE: OccurrencesFreshnessState = {
  isDisposed: false,
  isMutationBatchOverlapped: false,
  isReadInFlight: false,
  isReadRequired: false,
  pendingMutationCount: 0,
};

const START_READ: OccurrencesFreshnessTransition["commands"] = [
  { type: OCCURRENCES_FRESHNESS_COMMAND.startRead },
];

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
 * interrupted read, or a new server render made required.
 */
function settleMutation(state: OccurrencesFreshnessState): OccurrencesFreshnessTransition {
  const pendingMutationCount = Math.max(state.pendingMutationCount - 1, 0);
  const isReadRequired = state.isReadRequired || state.isMutationBatchOverlapped;

  if (pendingMutationCount > 0) {
    return { commands: [], state: { ...state, isReadRequired, pendingMutationCount } };
  }

  const settledState: OccurrencesFreshnessState = {
    ...state,
    isMutationBatchOverlapped: false,
    isReadRequired: false,
    pendingMutationCount,
  };

  return isReadRequired
    ? { commands: START_READ, state: { ...settledState, isReadInFlight: true } }
    : { commands: [], state: settledState };
}

/**
 * Handles a new server render: with a mutation pending the read becomes
 * required; with a read in flight (it belongs to the previous render) it
 * restarts against the new one.
 */
function changeSource(state: OccurrencesFreshnessState): OccurrencesFreshnessTransition {
  if (state.pendingMutationCount > 0) {
    return { commands: [], state: { ...state, isReadRequired: true } };
  }

  return state.isReadInFlight
    ? {
        commands: [{ type: OCCURRENCES_FRESHNESS_COMMAND.abortRead }, ...START_READ],
        state,
      }
    : { commands: [], state };
}

/**
 * Computes the next freshness state of the occurrences and the commands to run.
 *
 * @param state - Current state.
 * @param event - Mutation, read, new server render, or unmount.
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
      return settleMutation(state);
    case OCCURRENCES_FRESHNESS_EVENT.readSettled:
      return { commands: [], state: { ...state, isReadInFlight: false } };
    case OCCURRENCES_FRESHNESS_EVENT.sourceChanged:
      return changeSource(state);
    case OCCURRENCES_FRESHNESS_EVENT.disposed:
      return {
        commands: [{ type: OCCURRENCES_FRESHNESS_COMMAND.abortRead }],
        state: { ...state, isDisposed: true, isReadInFlight: false, isReadRequired: false },
      };
  }
}
