import { describe, expect, it } from "vitest";

import {
  INITIAL_STREAK_FRESHNESS_STATE,
  STREAK_READ_RETRY_DELAYS_MS,
  transitionStreakFreshness,
  type StreakFreshnessEvent,
  type StreakMutationOutcome,
  type StreakFreshnessState,
  type StreakFreshnessTransition,
} from "@/lib/events/tribe-event-streak-freshness";

const NOW_TIME = Date.parse("2026-05-20T19:05:00.000Z");
const PASSED_DEADLINE = "2026-05-20T19:00:00.000Z";
const OTHER_PASSED_DEADLINE = "2026-05-20T19:02:00.000Z";
const UPCOMING_DEADLINE = "2026-05-27T19:00:00.000Z";

/**
 * Applies a sequence of events and collects every command they emitted.
 */
function run(
  events: StreakFreshnessEvent[],
  initialState: StreakFreshnessState = INITIAL_STREAK_FRESHNESS_STATE
): StreakFreshnessTransition {
  return events.reduce<StreakFreshnessTransition>(
    (transition, event) => {
      const next = transitionStreakFreshness(transition.state, event);

      return { commands: [...transition.commands, ...next.commands], state: next.state };
    },
    { commands: [], state: initialState }
  );
}

function deadlineReturned(nextRefreshAt: string | null): StreakFreshnessEvent {
  return { nextRefreshAt, nowTime: NOW_TIME, type: "deadline-returned" };
}

const MUTATION_STARTED: StreakFreshnessEvent = { type: "mutation-started" };
const READ_REQUESTED: StreakFreshnessEvent = { type: "read-requested" };
const READ_SUCCEEDED: StreakFreshnessEvent = { outcome: "succeeded", type: "read-settled" };
const READ_FAILED: StreakFreshnessEvent = { outcome: "failed", type: "read-settled" };
const READ_PARTIAL: StreakFreshnessEvent = { outcome: "partial", type: "read-settled" };
const SOURCE_CHANGED: StreakFreshnessEvent = { type: "source-changed" };
const DISPOSED: StreakFreshnessEvent = { type: "disposed" };

function mutationSettled(outcome: StreakMutationOutcome): StreakFreshnessEvent {
  return { outcome, type: "mutation-settled" };
}

describe("transitionStreakFreshness reads and mutations", () => {
  it("starts a read right away when no mutation is pending", () => {
    const transition = run([{ type: "read-requested" }]);

    expect(transition.commands).toEqual([{ type: "start-read" }]);
    expect(transition.state.isReadInFlight).toBe(true);
  });

  it("applies the response of a lone mutation that carried the streak without reading", () => {
    const transition = run([MUTATION_STARTED, mutationSettled("carried")]);

    expect(transition.commands).toEqual([{ type: "apply-mutation-streak" }]);
    expect(transition.state.pendingRead).toBe("none");
  });

  it("reads once a lone mutation omits the streak or its next refresh instant", () => {
    const transition = run([MUTATION_STARTED, mutationSettled("missing")]);

    expect(transition.commands).toEqual([{ type: "start-read" }]);
  });

  it("does not read after a lone attendance answer", () => {
    const transition = run([MUTATION_STARTED, mutationSettled("unaffected")]);

    expect(transition.commands).toEqual([]);
  });

  it("applies no response of overlapping series mutations and reads once after both settle", () => {
    const firstSettled = run([MUTATION_STARTED, MUTATION_STARTED, mutationSettled("carried")]);

    // The later-started mutation committed first: nothing lands and nothing
    // is read while the other one is still uncommitted.
    expect(firstSettled.commands).toEqual([]);

    const bothSettled = run([mutationSettled("carried")], firstSettled.state);

    expect(bothSettled.commands).toEqual([{ type: "start-read" }]);
    expect(bothSettled.state.pendingRead).toBe("none");
    expect(bothSettled.state.isMutationBatchOverlapped).toBe(false);
  });

  it("applies no series response that overlapped an attendance answer", () => {
    const transition = run([
      MUTATION_STARTED,
      MUTATION_STARTED,
      mutationSettled("unaffected"),
      mutationSettled("carried"),
    ]);

    expect(transition.commands).toEqual([{ type: "start-read" }]);
  });

  it("applies the response of the next lone mutation once an overlapped batch settled", () => {
    const transition = run([
      MUTATION_STARTED,
      MUTATION_STARTED,
      mutationSettled("carried"),
      mutationSettled("carried"),
      READ_SUCCEEDED,
      MUTATION_STARTED,
      mutationSettled("carried"),
    ]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      { type: "apply-mutation-streak" },
    ]);
  });

  it("defers a read requested while a mutation is pending and runs it after applying it", () => {
    const transition = run([
      MUTATION_STARTED,
      { type: "read-requested" },
      mutationSettled("carried"),
    ]);

    expect(transition.commands).toEqual([
      { type: "apply-mutation-streak" },
      { type: "start-read" },
    ]);
    expect(transition.state.pendingMutationCount).toBe(0);
    expect(transition.state.pendingRead).toBe("none");
  });

  it("lets the lone mutation that interrupted a read cover it with its applied response", () => {
    const transition = run([
      { type: "read-requested" },
      MUTATION_STARTED,
      mutationSettled("carried"),
    ]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      { type: "abort-read" },
      { type: "apply-mutation-streak" },
    ]);
    expect(transition.state.isReadInFlight).toBe(false);
  });

  it("reads again when the mutation that interrupted a read carries no streak", () => {
    const transition = run([
      { type: "read-requested" },
      MUTATION_STARTED,
      mutationSettled("unaffected"),
    ]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      { type: "abort-read" },
      { type: "start-read" },
    ]);
  });

  it("keeps an interrupted read until every overlapping mutation settles", () => {
    const transition = run([
      { type: "read-requested" },
      MUTATION_STARTED,
      MUTATION_STARTED,
      mutationSettled("carried"),
    ]);

    expect(transition.commands).toEqual([{ type: "start-read" }, { type: "abort-read" }]);
    expect(transition.state.pendingRead).toBe("required");

    const settled = transitionStreakFreshness(transition.state, mutationSettled("unaffected"));

    expect(settled.commands).toEqual([{ type: "start-read" }]);
    expect(settled.state.pendingRead).toBe("none");
  });

  it("marks a finished read as settled", () => {
    const transition = run([{ type: "read-requested" }, READ_SUCCEEDED]);

    expect(transition.state.isReadInFlight).toBe(false);
  });
});

describe("transitionStreakFreshness passed deadlines", () => {
  it("reads right away the first time a passed deadline is returned", () => {
    const transition = run([deadlineReturned(PASSED_DEADLINE)]);

    expect(transition.commands).toEqual([{ type: "start-read" }]);
    expect(transition.state.passedDeadline).toEqual({
      nextRefreshAt: PASSED_DEADLINE,
      retryCount: 0,
    });
  });

  it("retries a repeated passed deadline with a bounded backoff", () => {
    const transition = run([
      deadlineReturned(PASSED_DEADLINE),
      ...STREAK_READ_RETRY_DELAYS_MS.map(() => deadlineReturned(PASSED_DEADLINE)),
      deadlineReturned(PASSED_DEADLINE),
    ]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      ...STREAK_READ_RETRY_DELAYS_MS.map((delayMs) => ({
        delayMs,
        type: "schedule-read",
      })),
    ]);
    expect(transition.state.passedDeadline?.retryCount).toBe(
      STREAK_READ_RETRY_DELAYS_MS.length
    );
  });

  it("restarts the retries when a different passed deadline arrives", () => {
    const transition = run([
      deadlineReturned(PASSED_DEADLINE),
      deadlineReturned(PASSED_DEADLINE),
      deadlineReturned(OTHER_PASSED_DEADLINE),
    ]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      { delayMs: STREAK_READ_RETRY_DELAYS_MS[0], type: "schedule-read" },
      { type: "cancel-scheduled-read" },
      { type: "start-read" },
    ]);
  });

  it("cancels a scheduled retry once the deadline is ahead again", () => {
    const transition = run([
      deadlineReturned(PASSED_DEADLINE),
      deadlineReturned(PASSED_DEADLINE),
      deadlineReturned(UPCOMING_DEADLINE),
    ]);

    expect(transition.commands.at(-1)).toEqual({ type: "cancel-scheduled-read" });
    expect(transition.state.passedDeadline).toBeNull();
  });

  it("forgets the passed deadline when the server renders a new source", () => {
    const transition = run([
      deadlineReturned(PASSED_DEADLINE),
      deadlineReturned(PASSED_DEADLINE),
      { type: "source-changed" },
    ]);

    expect(transition.commands.at(-1)).toEqual({ type: "cancel-scheduled-read" });
    expect(transition.state.passedDeadline).toBeNull();
  });

  it("ignores deadlines that are ahead or absent when none is tracked", () => {
    const transition = run([deadlineReturned(UPCOMING_DEADLINE), deadlineReturned(null)]);

    expect(transition.commands).toEqual([]);
  });

  it("defers the read of a passed deadline while a mutation is pending", () => {
    const transition = run([
      MUTATION_STARTED,
      deadlineReturned(PASSED_DEADLINE),
      mutationSettled("carried"),
    ]);

    expect(transition.commands).toEqual([
      { type: "apply-mutation-streak" },
      { type: "start-read" },
    ]);
  });
});

describe("transitionStreakFreshness failed reads", () => {
  it("retries a read that keeps failing with a bounded backoff and then stops", () => {
    const failedReads = STREAK_READ_RETRY_DELAYS_MS.flatMap(() => [READ_FAILED, READ_REQUESTED]);
    const transition = run([READ_REQUESTED, ...failedReads, READ_FAILED]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      ...STREAK_READ_RETRY_DELAYS_MS.flatMap((delayMs) => [
        { delayMs, type: "schedule-read" },
        { type: "start-read" },
      ]),
    ]);
    expect(transition.state.isReadInFlight).toBe(false);
    expect(transition.state.failedReadRetryCount).toBe(0);
  });

  it("cancels the retry a failed read scheduled once a read succeeds", () => {
    const transition = run([READ_REQUESTED, READ_FAILED, READ_REQUESTED, READ_SUCCEEDED]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      { delayMs: STREAK_READ_RETRY_DELAYS_MS[0], type: "schedule-read" },
      { type: "start-read" },
      { type: "cancel-scheduled-read" },
    ]);
    expect(transition.state.failedReadRetryCount).toBe(0);
  });

  it("restarts the backoff after a success", () => {
    const transition = run([
      READ_REQUESTED,
      READ_FAILED,
      READ_REQUESTED,
      READ_SUCCEEDED,
      READ_REQUESTED,
      READ_FAILED,
    ]);

    expect(transition.commands.at(-1)).toEqual({
      delayMs: STREAK_READ_RETRY_DELAYS_MS[0],
      type: "schedule-read",
    });
  });

  it("forgets the failed read retries when the server renders a new source", () => {
    const transition = run([READ_REQUESTED, READ_FAILED, { type: "source-changed" }]);

    expect(transition.commands.at(-1)).toEqual({ type: "cancel-scheduled-read" });
    expect(transition.state.failedReadRetryCount).toBe(0);
  });

  it("defers the retry of a failed read while a mutation is pending", () => {
    const transition = run([
      READ_REQUESTED,
      READ_FAILED,
      MUTATION_STARTED,
      READ_REQUESTED,
      mutationSettled("unaffected"),
    ]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      { delayMs: STREAK_READ_RETRY_DELAYS_MS[0], type: "schedule-read" },
      { type: "start-read" },
    ]);
  });
});

describe("transitionStreakFreshness partial reads", () => {
  it("retries a read that keeps omitting the next refresh instant with a bounded backoff", () => {
    const partialReads = STREAK_READ_RETRY_DELAYS_MS.flatMap(() => [READ_PARTIAL, READ_REQUESTED]);
    const transition = run([READ_REQUESTED, ...partialReads, READ_PARTIAL]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      ...STREAK_READ_RETRY_DELAYS_MS.flatMap((delayMs) => [
        { delayMs, type: "schedule-read" },
        { type: "start-read" },
      ]),
    ]);
    expect(transition.state.failedReadRetryCount).toBe(0);
  });

  it("stops retrying once a read returns the next refresh instant", () => {
    const transition = run([READ_REQUESTED, READ_PARTIAL, READ_REQUESTED, READ_SUCCEEDED]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      { delayMs: STREAK_READ_RETRY_DELAYS_MS[0], type: "schedule-read" },
      { type: "start-read" },
      { type: "cancel-scheduled-read" },
    ]);
    expect(transition.state.failedReadRetryCount).toBe(0);
  });
});

describe("transitionStreakFreshness server render changes", () => {
  it("reads once a lone mutation that carried the streak settles after a new render", () => {
    const transition = run([MUTATION_STARTED, SOURCE_CHANGED, mutationSettled("carried")]);

    // The response is tagged with the previous render, so the hook drops it;
    // the new render may predate the commit, so the read runs.
    expect(transition.commands).toEqual([
      { type: "apply-mutation-streak" },
      { type: "start-read" },
    ]);
    expect(transition.state.pendingRead).toBe("none");
  });

  it("reads once an attendance answer pending across a new render settles", () => {
    const transition = run([MUTATION_STARTED, SOURCE_CHANGED, mutationSettled("unaffected")]);

    expect(transition.commands).toEqual([{ type: "start-read" }]);
  });

  it("does not read when the server renders a new source with no mutation pending", () => {
    const transition = run([SOURCE_CHANGED]);

    expect(transition.commands).toEqual([]);
    expect(transition.state.pendingRead).toBe("none");
  });
});

describe("transitionStreakFreshness disposal", () => {
  it("aborts the read in flight and cancels the scheduled one when disposed", () => {
    const transition = run([READ_REQUESTED, DISPOSED]);

    expect(transition.commands).toEqual([
      { type: "start-read" },
      { type: "abort-read" },
      { type: "cancel-scheduled-read" },
    ]);
    expect(transition.state.isDisposed).toBe(true);
    expect(transition.state.isReadInFlight).toBe(false);
  });

  it("emits no command for a mutation that settles after the disposal", () => {
    const disposed = run([MUTATION_STARTED, DISPOSED]);
    const transition = run(
      [
        mutationSettled("missing"),
        mutationSettled("carried"),
        READ_REQUESTED,
        READ_FAILED,
        deadlineReturned(PASSED_DEADLINE),
        { type: "source-changed" },
        DISPOSED,
      ],
      disposed.state
    );

    expect(transition.commands).toEqual([]);
    expect(transition.state).toBe(disposed.state);
  });
});
