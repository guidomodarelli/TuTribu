import { describe, expect, it } from "vitest";

import {
  INITIAL_OCCURRENCES_FRESHNESS_STATE,
  transitionOccurrencesFreshness,
  type OccurrencesFreshnessEvent,
  type OccurrencesFreshnessState,
  type OccurrencesFreshnessTransition,
} from "@/lib/events/tribe-event-occurrences-freshness";

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
const MUTATION_SETTLED: OccurrencesFreshnessEvent = { type: "mutation-settled" };
const READ_SETTLED: OccurrencesFreshnessEvent = { type: "read-settled" };
const SOURCE_CHANGED: OccurrencesFreshnessEvent = { type: "source-changed" };
const DISPOSED: OccurrencesFreshnessEvent = { type: "disposed" };

describe("transitionOccurrencesFreshness", () => {
  it("does not read after a lone mutation", () => {
    const transition = run([MUTATION_STARTED, MUTATION_SETTLED]);

    expect(transition.commands).toEqual([]);
    expect(transition.state.isReadInFlight).toBe(false);
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

    expect(transition.commands).toEqual([{ type: "start-read" }, { type: "abort-read" }]);
  });
});
