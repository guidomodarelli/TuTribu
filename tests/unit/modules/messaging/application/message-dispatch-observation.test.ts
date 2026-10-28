/** @vitest-environment node */
/** Exercises real portable scheduling through own ports, including late evidence and observation failure. @module message-dispatch-observation-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ObserveMessageDispatchRunUseCase } from "@/src/modules/messaging/application/use-cases/observe-message-dispatch-run-use-case";
import type { MessageDeliveryRepository, ClaimedMessageDelivery } from "@/src/modules/messaging/domain/repositories/message-delivery-repository";
import type { MessageDeliverySender, MessagingDispatchDiagnostic } from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import type { MessageDispatchPhaseSample, MessageDispatchRunRecorder, MessageDispatchTribeRun } from "@/src/modules/messaging/domain/repositories/message-dispatch-observation";

/** @param count - Distinct native tenant obligations. @returns Own persistence/sender ports and observable committed facts; no SDK/platform mock. */
function fixture(count = 2) {
  const claims: ClaimedMessageDelivery[] = Array.from({ length: count }, () => ({ deliveryId: randomUUID(), tribeId: randomUUID(), contributingLeaderUserId: randomUUID(), version: 1, leaseToken: randomUUID() }));
  const tribes = claims.map((claim) => claim.tribeId), queue = [...claims], reports: MessagingDispatchDiagnostic[] = [], deferred: Promise<void>[] = [], runs: MessageDispatchTribeRun[] = [], phases: MessageDispatchPhaseSample[] = [];
  let sends = 0, finishes = 0;
  const repository: MessageDeliveryRepository = {
    async claim(command) { return queue.splice(0, command.limit); },
    async authorize(claim, requestId) { return { outcome: "authorized", deliveryVersion: 2, context: { authorizationPurpose: "authorized_delivery", contributingLeaderUserId: claim.contributingLeaderUserId!, tribeId: claim.tribeId, connectionId: randomUUID(), connectionVersion: 1, environment: "synthetic", securityEpoch: "synthetic-epoch", requestId, secretRef: randomUUID(), deliveryId: claim.deliveryId, attemptId: randomUUID(), attemptVersion: 1, leaseToken: claim.leaseToken, sendAuthorizedAt: new Date(), authorizedUsagePolicyVersion: 1, operation: "dispatch_delivery", deliveryPurpose: "admission", notificationGroupId: null } }; },
    async complete() { return { outcome: "completed", attemptVersion: 2, deliveryVersion: 3 }; }, async readAttempt() { return null; }, async reconcileExpiredLeases() { return 0; },
  };
  const recorder: MessageDispatchRunRecorder = { async begin(runId) { return { runId, startedAt: new Date(), environment: "synthetic", securityEpoch: "synthetic-epoch" }; }, async finish(_start, values, samples) { finishes += 1; runs.push(...values); phases.push(...samples); }, async appendPhases(_start, samples) { phases.push(...samples); } };
  const sender: MessageDeliverySender = { async prepare() { return { async send() { sends += 1; return { outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" }; } }; } };
  const settings = { requestTimeoutMs: 20, runBudgetMs: 150, leaseSeconds: 1, concurrency: 2, batchLimit: 2 };
  const runtime = { now: Date.now, createId: randomUUID, report: (report: MessagingDispatchDiagnostic) => { reports.push(report); }, defer: (work: Promise<void>) => { deferred.push(work); } };
  return { repository, recorder, sender, settings, runtime, queue, tribes, runs, phases, reports, deferred, get sends() { return sends; }, get finishes() { return finishes; }, execute: (focalTribeId?: string) => new ObserveMessageDispatchRunUseCase({ deliveries: repository, sender, settings, runtime, recorder, focalTribeId }).execute() };
}

describe("persistent portable dispatch observations", () => {
  it("should keep real counts and phase samples isolated by their original native tribe", async () => {
    const state = fixture();
    expect(await state.execute()).toMatchObject({ claimed: 2, authorized: 2, accepted: 2, delivered: 0, unresolved: 0 });
    expect(state.sends).toBe(2); expect(state.finishes).toBe(1);
    expect(state.runs).toHaveLength(2);
    for (const tribeId of state.tribes) {
      expect(state.runs.find((run) => run.tribeId === tribeId)?.counters).toMatchObject({ claimed: 1, authorized: 1, accepted: 1, delivered: 0, unresolved: 0 });
      expect(new Set(state.phases.filter((sample) => sample.tribeId === tribeId).map((sample) => sample.phase))).toEqual(new Set(["claim", "authorize", "prepare", "send", "complete"]));
    }
    expect(state.phases.every((sample) => Number.isSafeInteger(sample.durationMs) && sample.durationMs >= 0)).toBe(true);
  });
  it("should retain a genuine empty focal execution while not fabricating a tenant for an empty global queue", async () => {
    const global = fixture(0), focal = fixture(0), tribeId = randomUUID();
    expect(await global.execute()).toMatchObject({ claimed: 0, unresolved: 0 }); expect(global.runs).toEqual([]);
    expect(await focal.execute(tribeId)).toMatchObject({ claimed: 0, unresolved: 0 });
    expect(focal.runs).toEqual([{ tribeId, outcome: "completed", counters: { claimed: 0, authorized: 0, accepted: 0, delivered: 0, rejected: 0, unknown: 0, suppressed: 0, quotaDeferred: 0, unresolved: 0, deadlineReached: false } }]);
    expect(focal.phases).toEqual([expect.objectContaining({ tribeId, phase: "claim" })]);
  });
  it("should withhold new business work if native observation cannot begin and bound a missing response", async () => {
    for (const begin of [async () => { throw new Error("private observer failure"); }, () => new Promise<never>(() => undefined)]) {
      const state = fixture(1); state.recorder.begin = begin; state.settings.runBudgetMs = 30;
      const startedAt = Date.now(); expect(await state.execute()).toMatchObject({ claimed: 0, unresolved: 0, workerOutcome: "incomplete", observationOutcome: "unavailable" });
      expect(Date.now() - startedAt).toBeLessThan(300); expect(state.sends).toBe(0); expect(state.finishes).toBe(0); expect(state.queue).toHaveLength(1);
      expect(state.reports).toContainEqual(expect.objectContaining({ stage: "observation" }));
    }
  });
  it("should preserve confirmed delivery counters when observation fails without a second send or finish", async () => {
    const state = fixture(1); let calls = 0;
    state.recorder.finish = async () => { calls += 1; throw new Error("private storage failure"); };
    expect(await state.execute()).toMatchObject({ accepted: 1, unresolved: 0, workerOutcome: "incomplete", observationOutcome: "unavailable" }); expect(state.sends).toBe(1); expect(calls).toBe(1);
    expect(state.reports).toContainEqual(expect.objectContaining({ stage: "observation" }));
  });
  it("should retain one original late observation without blocking the run or retrying its write", async () => {
    vi.useFakeTimers();
    const state = fixture(1); state.settings.runBudgetMs = 40;
    let calls = 0, runFinished = false, finish!: () => void;
    const originalObservation = new Promise<void>((resolve) => { finish = resolve; });
    state.recorder.finish = () => { calls += 1; return originalObservation; };
    try {
      const run = state.execute().then((result) => { runFinished = true; return result; });
      await vi.advanceTimersByTimeAsync(state.settings.runBudgetMs - 1);
      expect(runFinished).toBe(false); expect(state.sends).toBe(1); expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await run).toMatchObject({ accepted: 1, unresolved: 0, deadlineReached: true, workerOutcome: "incomplete", observationOutcome: "unavailable" });
      expect(state.deferred).toHaveLength(1);
      finish(); await Promise.all(state.deferred);
      expect(state.sends).toBe(1); expect(calls).toBe(1); expect(vi.getTimerCount()).toBe(0);
    } finally {
      finish(); await Promise.allSettled(state.deferred); vi.useRealTimers();
    }
  });
  it("should record original late phase evidence after an uncertain send and keep the run incomplete", async () => {
    const state = fixture(1); let finish!: () => void;
    state.sender.prepare = async () => ({ send: () => new Promise((resolve) => { finish = () => resolve({ outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" }); }) });
    expect(await state.execute()).toMatchObject({ unknown: 1, accepted: 0, unresolved: 0, workerOutcome: "incomplete", observationOutcome: "recorded" });
    expect(state.runs[0].counters).toMatchObject({ unknown: 1, accepted: 0, unresolved: expect.any(Number) });
    finish(); for (let position = 0; position < state.deferred.length;) { const batch = state.deferred.slice(position); position = state.deferred.length; await Promise.all(batch); }
    expect(state.phases).toContainEqual(expect.objectContaining({ phase: "send", tribeId: state.tribes[0] }));
    expect(state.phases).toContainEqual(expect.objectContaining({ phase: "late", tribeId: state.tribes[0] }));
    expect(state.runs[0].counters.accepted).toBe(0); expect(state.finishes).toBe(1);
  });
  it("should attribute retained late work only to the original obligation and keep other tenant counters exact", async () => {
    const state = fixture(2); let finish!: () => void;
    state.sender.prepare = async (context) => ({ send: async () => context.tribeId === state.tribes[0] ? new Promise((resolve) => { finish = () => resolve({ outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" }); }) : { outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" } });
    expect(await state.execute()).toMatchObject({ accepted: 1, unknown: 1, unresolved: 0, workerOutcome: "incomplete" });
    expect(state.runs.find((run) => run.tribeId === state.tribes[1])?.counters).toMatchObject({ accepted: 1, unknown: 0, unresolved: 0 });
    finish(); for (let position = 0; position < state.deferred.length;) { const batch = state.deferred.slice(position); position = state.deferred.length; await Promise.all(batch); }
    expect(state.phases.filter((sample) => sample.phase === "late").map((sample) => sample.tribeId)).toEqual([state.tribes[0]]);
  });
  it("should preserve the real scope of a global claim that settles after the run without another authorization", async () => {
    const state = fixture(1); state.settings.runBudgetMs = 30; let finish!: () => void, lateScopes: readonly MessageDispatchTribeRun[] = [], authorizations = 0;
    const claims = [...state.queue]; state.repository.claim = () => new Promise((resolve) => { finish = () => resolve(claims); });
    state.repository.authorize = async () => { authorizations += 1; throw new Error("Late claim must not authorize another attempt"); };
    state.recorder.appendPhases = async (_start, samples, scopes) => { state.phases.push(...samples); lateScopes = scopes ?? []; };
    expect(await state.execute()).toMatchObject({ claimed: 0, authorized: 0, unresolved: 1, workerOutcome: "incomplete" }); expect(state.runs).toEqual([]);
    finish(); for (let position = 0; position < state.deferred.length;) { const batch = state.deferred.slice(position); position = state.deferred.length; await Promise.all(batch); }
    expect(authorizations).toBe(0); expect(lateScopes).toEqual([expect.objectContaining({ tribeId: state.tribes[0], outcome: "incomplete", counters: expect.objectContaining({ claimed: 1, authorized: 0 }) })]);
    expect(state.phases).toContainEqual(expect.objectContaining({ tribeId: state.tribes[0], phase: "claim" }));
  });
  it("should align the SQL budget with its clock sample while including a slower final start check in the worker budget", async () => {
    const state = fixture(1), base = Date.now(); let now = base, storedBudgetMs = 0;
    state.settings.runBudgetMs = 100; state.runtime.now = () => now;
    state.recorder.begin = async (runId) => { now += 20; const clockObservedAtMs = now; now += 40; return { runId, startedAt: new Date(), clockObservedAtMs, environment: "synthetic", securityEpoch: "synthetic-epoch" }; };
    state.recorder.finish = async (_start, runs, phases, budgetMs) => { storedBudgetMs = budgetMs; state.runs.push(...runs); state.phases.push(...phases); };
    expect(await state.execute()).toMatchObject({ accepted: 1, elapsedMs: 60, deadlineReached: false, workerOutcome: "completed", observationOutcome: "recorded" });
    expect(storedBudgetMs).toBe(80);
  });
});
