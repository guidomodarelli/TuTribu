import { describe, expect, it } from "vitest";

import {
  INITIAL_OCCURRENCES_FRESHNESS_STATE,
  OCCURRENCES_MUTATION_OUTCOME,
  OCCURRENCES_READ_OUTCOME,
  transitionOccurrencesFreshness,
  type OccurrencesFreshnessEvent,
  type OccurrencesFreshnessState,
  type OccurrencesFreshnessTransition,
} from "@/lib/events/tribe-event-occurrences-freshness";
import { FRESHNESS_READ_RETRY_DELAYS_MS } from "@/lib/events/tribe-event-read-retry";

/**
 * Applies a sequence of events and collects every command they emitted.
 */
function run(
  events: OccurrencesFreshnessEvent[],
  initialState: OccurrencesFreshnessState = INITIAL_OCCURRENCES_FRESHNESS_STATE
): OccurrencesFreshnessTransition {
  return events.reduce<OccurrencesFreshnessTransition>(
    (transition, event) => {
      const next = transitionOccurrencesFreshness(transition.state, event);

      return { commands: [...transition.commands, ...next.commands], state: next.state };
    },
    { commands: [], state: initialState }
  );
}

const MUTATION_STARTED: OccurrencesFreshnessEvent = { type: "mutation-started" };
const MUTATION_SETTLED: OccurrencesFreshnessEvent = {
  outcome: OCCURRENCES_MUTATION_OUTCOME.applied,
  type: "mutation-settled",
};
const MUTATION_REJECTED: OccurrencesFreshnessEvent = {
  outcome: OCCURRENCES_MUTATION_OUTCOME.rejected,
  type: "mutation-settled",
};
const MUTATION_AMBIGUOUS: OccurrencesFreshnessEvent = {
  outcome: OCCURRENCES_MUTATION_OUTCOME.ambiguous,
  type: "mutation-settled",
};
const READ_SETTLED: OccurrencesFreshnessEvent = {
  outcome: OCCURRENCES_READ_OUTCOME.succeeded,
  type: "read-settled",
};
const READ_FAILED: OccurrencesFreshnessEvent = {
  outcome: OCCURRENCES_READ_OUTCOME.failed,
  type: "read-settled",
};
const READ_RETRY_DUE: OccurrencesFreshnessEvent = { type: "read-retry-due" };
const OVERLAPPED_BATCH: OccurrencesFreshnessEvent[] = [
  MUTATION_STARTED,
  MUTATION_STARTED,
  MUTATION_SETTLED,
  MUTATION_SETTLED,
];
const SOURCE_CHANGED: OccurrencesFreshnessEvent = { type: "source-changed" };
const DISPOSED: OccurrencesFreshnessEvent = { type: "disposed" };

describe("transitionOccurrencesFreshness", () => {
  it("does not read after a lone mutation", () => {
    const transition = run([MUTATION_STARTED, MUTATION_SETTLED]);

    expect(transition.commands).toEqual([]);
    expect(transition.state.isReadInFlight).toBe(false);
  });

  it("does not read after a lone mutation the route rejected", () => {
    const transition = run([MUTATION_STARTED, MUTATION_REJECTED]);

    expect(transition.commands).toEqual([]);
    expect(transition.state.isReadRequired).toBe(false);
  });

  it("reads the month once after a lone mutation whose outcome is ambiguous", () => {
    const transition = run([MUTATION_STARTED, MUTATION_AMBIGUOUS]);

    expect(transition.commands).toEqual([{ type: "start-read" }]);
    expect(transition.state.isReadInFlight).toBe(true);
    expect(transition.state.isReadRequired).toBe(false);
  });

  it("waits for every pending mutation before reading after an ambiguous one", () => {
    const transition = run([MUTATION_STARTED, MUTATION_STARTED, MUTATION_AMBIGUOUS]);

    expect(transition.commands).toEqual([]);
    expect(transition.state.isReadRequired).toBe(true);

    const settled = run([MUTATION_REJECTED], transition.state);

    expect(settled.commands).toEqual([{ type: "start-read" }]);
  });

  it("retries the read an ambiguous mutation required with the bounded backoff", () => {
    const transition = run([MUTATION_STARTED, MUTATION_AMBIGUOUS, READ_FAILED, READ_RETRY_DUE]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      { delayMs: FRESHNESS_READ_RETRY_DELAYS_MS[0], type: "schedule-read" },
      { type: "start-read" },
    ]);
  });

  it("does not read after the next lone mutation once an ambiguous one was reconciled", () => {
    const transition = run([
      MUTATION_STARTED,
      MUTATION_AMBIGUOUS,
      READ_SETTLED,
      MUTATION_STARTED,
      MUTATION_SETTLED,
    ]);

    expect(transition.commands).toEqual([{ type: "start-read" }]);
  });

  it("reads the month once after an edit and an attendance answer overlap", () => {
    const transition = run([MUTATION_STARTED, MUTATION_STARTED, MUTATION_SETTLED]);

    // No read while the second mutation is still uncommitted.
    expect(transition.commands).toEqual([]);

    const settled = run([MUTATION_SETTLED], transition.state);

    expect(settled.commands).toEqual([{ type: "start-read" }]);
    expect(settled.state.isMutationBatchOverlapped).toBe(false);
    expect(settled.state.isReadInFlight).toBe(true);
  });

  it("does not read after the next lone mutation once an overlapped batch settled", () => {
    const transition = run([
      MUTATION_STARTED,
      MUTATION_STARTED,
      MUTATION_SETTLED,
      MUTATION_SETTLED,
      READ_SETTLED,
      MUTATION_STARTED,
      MUTATION_SETTLED,
    ]);

    expect(transition.commands).toEqual([{ type: "start-read" }]);
  });

  it("aborts a read a mutation interrupts and reads again once it settles", () => {
    const transition = run([
      MUTATION_STARTED,
      MUTATION_STARTED,
      MUTATION_SETTLED,
      MUTATION_SETTLED,
      MUTATION_STARTED,
      MUTATION_SETTLED,
    ]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      { type: "abort-read" },
      { type: "start-read" },
    ]);
  });

  it("reads once a mutation pending across a new server render settles", () => {
    const transition = run([MUTATION_STARTED, SOURCE_CHANGED, MUTATION_SETTLED]);

    expect(transition.commands).toEqual([{ type: "start-read" }]);
  });

  it("restarts a read in flight against a new server render", () => {
    const transition = run([
      MUTATION_STARTED,
      MUTATION_STARTED,
      MUTATION_SETTLED,
      MUTATION_SETTLED,
      SOURCE_CHANGED,
    ]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      { type: "abort-read" },
      { type: "start-read" },
    ]);
  });

  it("does nothing on a new server render with no mutation or read pending", () => {
    expect(run([SOURCE_CHANGED]).commands).toEqual([]);
  });

  it("aborts the read in flight when disposed and ignores later events", () => {
    const transition = run([
      MUTATION_STARTED,
      MUTATION_STARTED,
      MUTATION_SETTLED,
      MUTATION_SETTLED,
      DISPOSED,
      MUTATION_STARTED,
      MUTATION_STARTED,
      MUTATION_SETTLED,
      MUTATION_SETTLED,
    ]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      { type: "abort-read" },
      { type: "cancel-scheduled-read" },
    ]);
  });

  it("retries a failed reconciliation read with the bounded backoff and then stops", () => {
    const retryEvents = FRESHNESS_READ_RETRY_DELAYS_MS.flatMap(() => [READ_FAILED, READ_RETRY_DUE]);
    const transition = run([...OVERLAPPED_BATCH, ...retryEvents, READ_FAILED]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      ...FRESHNESS_READ_RETRY_DELAYS_MS.flatMap((delayMs) => [
        { delayMs, type: "schedule-read" },
        { type: "start-read" },
      ]),
    ]);
    expect(transition.state.failedReadRetryCount).toBe(0);
    expect(transition.state.isReadRetryScheduled).toBe(false);
  });

  it("stops retrying once a reconciliation read succeeds", () => {
    const transition = run([...OVERLAPPED_BATCH, READ_FAILED, READ_RETRY_DUE, READ_SETTLED]);

    expect(transition.state.failedReadRetryCount).toBe(0);
    expect(run([READ_RETRY_DUE], transition.state).commands).toEqual([]);
  });

  it("does not retry a read a mutation aborted", () => {
    const transition = run([...OVERLAPPED_BATCH, MUTATION_STARTED]);

    expect(transition.commands.at(-1)).toEqual({ type: "abort-read" });
    expect(transition.state.isReadRetryScheduled).toBe(false);
  });

  it("waits for pending mutations when a retry comes due", () => {
    const transition = run([...OVERLAPPED_BATCH, READ_FAILED, MUTATION_STARTED, READ_RETRY_DUE]);

    expect(transition.commands.at(-1)).toEqual({ delayMs: FRESHNESS_READ_RETRY_DELAYS_MS[0], type: "schedule-read" });

    const settled = run([MUTATION_SETTLED], transition.state);

    expect(settled.commands).toEqual([{ type: "start-read" }]);
  });

  it("cancels the scheduled retry when a read starts earlier", () => {
    const transition = run([...OVERLAPPED_BATCH, READ_FAILED, ...OVERLAPPED_BATCH]);

    expect(transition.commands.slice(-2)).toEqual([
      { type: "cancel-scheduled-read" },
      { type: "start-read" },
    ]);
    expect(transition.state.isReadRetryScheduled).toBe(false);
  });

  it("cancels the scheduled retry on a new server render", () => {
    const transition = run([...OVERLAPPED_BATCH, READ_FAILED, SOURCE_CHANGED]);

    expect(transition.commands.at(-1)).toEqual({ type: "cancel-scheduled-read" });
    expect(transition.state.failedReadRetryCount).toBe(0);
    expect(run([READ_RETRY_DUE], transition.state).commands).toEqual([]);
  });

  it("cancels the scheduled retry when disposed", () => {
    const transition = run([...OVERLAPPED_BATCH, READ_FAILED, DISPOSED, READ_RETRY_DUE]);

    expect(transition.commands.slice(-2)).toEqual([
      { type: "abort-read" },
      { type: "cancel-scheduled-read" },
    ]);
  });
});
