/** @vitest-environment node */
/** Exercises numeric await accounting through its own clock and asynchronous work boundary. */
import { describe, expect, it } from "vitest";
import { setTimeout as delay } from "node:timers/promises";
import { createAdmissionStatementObserver } from "./admission-database-observation";
import { admissionDatabaseObservationSummarySchema } from "./constants/admission-database-observation";

describe("admission statement await observation", () => {
  it("should measure actual asynchronous work with the native monotonic clock", async () => {
    const observer = createAdmissionStatementObserver();
    await delay(2);
    await observer.observe(() => delay(2));
    const observed = observer.snapshot();
    expect(observed.statementCount).toBe(1);
    expect(observed.pendingStatements).toBe(0);
    expect(observed.observedAwaitMs).toBeGreaterThan(0);
    expect(observed.unobservedMs).toBeGreaterThan(0);
    expect(observed.elapsedMs).toBeGreaterThanOrEqual(observed.observedAwaitMs);
  });

  it("should retain original values and include transaction work outside observed statements", async () => {
    let now = 0;
    const observer = createAdmissionStatementObserver(() => now);
    now = 2;
    const value = { outcome: "confirmed" };
    expect(await observer.observe(async () => { now = 7; return value; })).toBe(value);
    now = 10;
    expect(observer.snapshot()).toEqual({ statementCount: 1, pendingStatements: 0, elapsedMs: 10, observedAwaitMs: 5, unobservedMs: 5 });
  });

  it("should count the union of overlapping awaits instead of summing concurrent durations", async () => {
    let now = 0;
    const observer = createAdmissionStatementObserver(() => now);
    let finishFirst!: () => void, finishSecond!: () => void;
    const first = observer.observe(() => new Promise<void>((resolve) => { finishFirst = resolve; }));
    now = 5;
    const second = observer.observe(() => new Promise<void>((resolve) => { finishSecond = resolve; }));
    now = 10;
    finishFirst();
    await first;
    now = 20;
    finishSecond();
    await second;
    now = 25;
    expect(observer.snapshot()).toEqual({ statementCount: 2, pendingStatements: 0, elapsedMs: 25, observedAwaitMs: 20, unobservedMs: 5 });
  });

  it("should propagate the actual rejection and close its interval", async () => {
    let now = 0;
    const observer = createAdmissionStatementObserver(() => now);
    const failure = new Error("Native observation fixture failed");
    const work = observer.observe(async () => { now = 4; throw failure; });
    await expect(work).rejects.toBe(failure);
    now = 10;
    expect(observer.snapshot()).toEqual({ statementCount: 1, pendingStatements: 0, elapsedMs: 10, observedAwaitMs: 4, unobservedMs: 6 });
  });

  it("should expose an unfinished await without mutating later snapshots", async () => {
    let now = 0;
    const observer = createAdmissionStatementObserver(() => now);
    let finish!: () => void;
    const work = observer.observe(() => new Promise<void>((resolve) => { finish = resolve; }));
    now = 8;
    expect(observer.snapshot()).toEqual({ statementCount: 1, pendingStatements: 1, elapsedMs: 8, observedAwaitMs: 8, unobservedMs: 0 });
    now = 10;
    finish();
    await work;
    now = 15;
    expect(observer.snapshot()).toEqual({ statementCount: 1, pendingStatements: 0, elapsedMs: 15, observedAwaitMs: 10, unobservedMs: 5 });
  });

  it("should keep nested observations inside the same elapsed interval", async () => {
    let now = 0;
    const observer = createAdmissionStatementObserver(() => now);
    await observer.observe(async () => {
      now = 2;
      await observer.observe(async () => { now = 6; });
      now = 8;
    });
    now = 10;
    expect(observer.snapshot()).toEqual({ statementCount: 2, pendingStatements: 0, elapsedMs: 10, observedAwaitMs: 8, unobservedMs: 2 });
  });

  it("should reject nonnumeric diagnostics and additional query data at the public result boundary", () => {
    const summary = { transactions: 1, statementCount: 1, pendingStatements: 0, elapsedP95Ms: 10, observedAwaitP95Ms: 6, unobservedP95Ms: 4, statementsPerTransactionP95: 1 };
    expect(admissionDatabaseObservationSummarySchema.parse(summary)).toEqual(summary);
    expect(admissionDatabaseObservationSummarySchema.safeParse({ ...summary, observedAwaitP95Ms: Infinity }).success).toBe(false);
    expect(admissionDatabaseObservationSummarySchema.safeParse({ ...summary, sql: "query text" }).success).toBe(false);
  });
});
