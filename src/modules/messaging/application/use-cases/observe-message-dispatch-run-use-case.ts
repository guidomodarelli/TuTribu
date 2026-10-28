/** Records real portable dispatch work without retrying SQL markers or provider requests. @module observe-message-dispatch-run */
import type { MessageDeliveryRepository, MessageDeliveryReceipt } from "../../domain/repositories/message-delivery-repository";
import type { MessageDeliverySender, MessagingDispatchRuntime, MessagingDispatchSettings } from "../../domain/repositories/message-delivery-sender";
import type { MessageDispatchCounters, MessageDispatchPhase, MessageDispatchPhaseSample, MessageDispatchRunRecorder, MessageDispatchRunStart, MessageDispatchTribeRun } from "../../domain/repositories/message-dispatch-observation";
import type { MessageDispatchRunResult } from "../results/message-dispatch-result";
import type { MessageDispatchObservedRunResult } from "../results/message-dispatch-observation-result";
import { DispatchMessageDeliveriesUseCase } from "./dispatch-message-deliveries-use-case";
import { MESSAGE_DISPATCH_OBSERVATION_LIMIT, MESSAGE_DISPATCH_OBSERVATION_PHASE, MESSAGE_DISPATCH_RUN_OUTCOME, MESSAGE_DISPATCH_OBSERVATION_OUTCOME } from "../../constants/message-dispatch-observation";
import { MESSAGE_ATTEMPT_STATE, MESSAGE_AUTHORIZATION_OUTCOME, MESSAGE_COMPLETION_OUTCOME } from "../../constants/message-delivery";
import { MESSAGING_DISPATCH_STAGE } from "../../constants/messaging-dispatch";
import { MessagingDispatchDeadlineError } from "../../domain/errors/messaging-dispatch-deadline-error";
import { observeWithin } from "./observe-dispatch-deadline";

/** @returns A fresh own counter object; it never shares mutable counts across tenants. */
function emptyResult(): MessageDispatchRunResult { return { claimed: 0, authorized: 0, accepted: 0, delivered: 0, rejected: 0, unknown: 0, suppressed: 0, quotaDeferred: 0, unresolved: 0, deadlineReached: false, elapsedMs: 0 }; }

/** @param counts - Own run result. @returns Its counters, without the elapsed observation. */
function dispatchCounters(counts: MessageDispatchRunResult): MessageDispatchCounters {
  return { claimed: counts.claimed, authorized: counts.authorized, accepted: counts.accepted, delivered: counts.delivered, rejected: counts.rejected, unknown: counts.unknown, suppressed: counts.suppressed, quotaDeferred: counts.quotaDeferred, unresolved: counts.unresolved, deadlineReached: counts.deadlineReached };
}

/** @param counts - Own run result. @returns Its counters, with every claimed delivery lacking a confirmed outcome counted as unresolved. */
function selectedCounters(counts: MessageDispatchRunResult): MessageDispatchCounters {
  const counters = dispatchCounters(counts);
  return { ...counters, unresolved: Math.max(counters.unresolved, counters.claimed - counters.suppressed - counters.quotaDeferred - counters.accepted - counters.delivered - counters.rejected - counters.unknown) };
}

/** Original dispatch owners, observation recorder and optional focal tenant. */
export type ObserveMessageDispatchRunDependencies = { deliveries: MessageDeliveryRepository; sender: MessageDeliverySender; settings: Readonly<MessagingDispatchSettings>; runtime: MessagingDispatchRuntime; recorder: MessageDispatchRunRecorder; focalTribeId?: string };

/** Every execution creates its own observers; concurrent calls cannot share phase/counter state. */
export class ObserveMessageDispatchRunUseCase {
  private readonly deliveries: MessageDeliveryRepository;
  private readonly sender: MessageDeliverySender;
  private readonly settings: Readonly<MessagingDispatchSettings>;
  private readonly runtime: MessagingDispatchRuntime;
  private readonly recorder: MessageDispatchRunRecorder;
  private readonly focalTribeId?: string;
  /** @param dependencies - `deliveries`: Original DB-only worker ports. `sender`: Original prepared sender. `settings`: Server-owned limits. `runtime`: Host lifecycle and safe diagnostics. `recorder`: Independently authorized persistent observations. `focalTribeId`: Optional actual native launch scope, never browser authority. */
  constructor({ deliveries, sender, settings, runtime, recorder, focalTribeId }: ObserveMessageDispatchRunDependencies) { this.deliveries = deliveries; this.sender = sender; this.settings = settings; this.runtime = runtime; this.recorder = recorder; this.focalTribeId = focalTribeId; }

  /** @param cause - Observation failure. @returns Nothing after the safe diagnostic. */
  private reportObservation(cause: unknown): void { this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.observation, cause }); }

  /** @param work - Observation write that outlives the run. @returns Nothing after retaining it under the host lifecycle. */
  private retainObservation(work: Promise<void>): void {
    const observed = work.catch((error: unknown) => this.reportObservation(error));
    try { this.runtime.defer(observed); } catch (error) { this.reportObservation(error); }
  }

  /**
   * Opens the persistent run observation before any dispatch work starts.
   * @param startedAt - Run start on the runtime clock.
   * @returns The observation start, or the unavailable result that ends the run without dispatching.
   */
  private async beginRun(startedAt: number): Promise<{ started: true; start: MessageDispatchRunStart } | { started: false; result: MessageDispatchObservedRunResult }> {
    try {
      const beginning = await observeWithin(this.recorder.begin(this.runtime.createId()), this.settings.runBudgetMs);
      if (!beginning.settled) throw new MessagingDispatchDeadlineError(MESSAGING_DISPATCH_STAGE.observation, this.settings.runBudgetMs);
      return { started: true, start: beginning.value };
    }
    catch (error) { this.reportObservation(error); const elapsedMs = Math.max(0, this.runtime.now() - startedAt); return { started: false, result: { ...emptyResult(), elapsedMs, deadlineReached: elapsedMs >= this.settings.runBudgetMs, workerOutcome: MESSAGE_DISPATCH_RUN_OUTCOME.incomplete, observationOutcome: MESSAGE_DISPATCH_OBSERVATION_OUTCOME.unavailable } }; }
  }

  /**
   * Persists the final run observation within the remaining run budget.
   * @param startedAt - Run start on the runtime clock.
   * @param finish - Starts the single final write and returns its persistence.
   * @returns Whether the observation was recorded; a slow write is retained, never repeated.
   */
  private async finishRun(startedAt: number, finish: () => Promise<void>): Promise<"recorded" | "unavailable"> {
    try {
      const persistence = finish();
      const finishing = await observeWithin(persistence, this.settings.runBudgetMs - (this.runtime.now() - startedAt));
      if (!finishing.settled) { this.retainObservation(persistence); throw new MessagingDispatchDeadlineError(MESSAGING_DISPATCH_STAGE.observation, this.settings.runBudgetMs); }
      return MESSAGE_DISPATCH_OBSERVATION_OUTCOME.recorded;
    }
    catch (error) { this.reportObservation(error); return MESSAGE_DISPATCH_OBSERVATION_OUTCOME.unavailable; }
  }

  /** @returns Original confirmed counters; unavailable observation remains explicit without repeating work. */
  async execute(): Promise<MessageDispatchObservedRunResult> {
    const startedAt = this.runtime.now();
    const scopes = new Map<string, MessageDispatchRunResult>(), deliveryScopes = new Map<string, string>(), countedAttempts = new Set<string>();
    const receipts = new Map<string, Pick<MessageDeliveryReceipt, "outcome" | "providerMessageId">>();
    const phases: MessageDispatchPhaseSample[] = [];
    let closed = false, incomplete = false, persistence: Promise<void> | undefined;
    const scope = (tribeId: string) => { const existing = scopes.get(tribeId); if (existing) return existing; const counters = emptyResult(); scopes.set(tribeId, counters); return counters; };
    if (this.focalTribeId) scope(this.focalTribeId);
    const begun = await this.beginRun(startedAt);
    if (!begun.started) return begun.result;
    const start = begun.start;
    const workBudgetMs = Math.max(0, this.settings.runBudgetMs - (this.runtime.now() - startedAt));
    const recordBudgetMs = Math.max(0, this.settings.runBudgetMs - ((start.clockObservedAtMs ?? this.runtime.now()) - startedAt));
    const lateScopes = (samples: readonly MessageDispatchPhaseSample[]): MessageDispatchTribeRun[] => [...new Set(samples.map((sample) => sample.tribeId))].map((tribeId) => ({ tribeId, outcome: MESSAGE_DISPATCH_RUN_OUTCOME.incomplete, counters: selectedCounters(scope(tribeId)) }));
    const appendLate = (samples: readonly MessageDispatchPhaseSample[]) => { if (samples.length) this.retainObservation((persistence ?? Promise.resolve()).then(() => this.recorder.appendPhases(start, samples, lateScopes(samples)))); };
    /** @param samples - Finished phase samples. @returns Nothing after keeping them in this run, appending them late, or marking the bounded run incomplete. */
    const keepSamples = (samples: MessageDispatchPhaseSample[]) => { if (closed) appendLate(samples); else if (phases.length + samples.length <= MESSAGE_DISPATCH_OBSERVATION_LIMIT.phaseSamples) phases.push(...samples); else incomplete = true; };
    /** @param phase - Fixed operation dimension. @param tribeIds - Native scopes of the original call. @param work - Exactly one original operation. @returns Its original value or error, without observer-triggered retries. */
    const measure = async <Value>(phase: MessageDispatchPhase, tribeIds: () => readonly string[], work: () => Promise<Value>): Promise<Value> => {
      const at = this.runtime.now(), sampleId = this.runtime.createId();
      try { return await work(); }
      finally {
        keepSamples([...new Set(tribeIds())].map((tribeId) => ({ sampleId, tribeId, phase, durationMs: Math.max(0, Math.ceil(this.runtime.now() - at)) })));
      }
    };
    const confirm = (tribeId: string, attemptId: string, outcome: "accepted" | "delivered" | "rejected" | "unknown") => { if (closed || countedAttempts.has(attemptId)) return; countedAttempts.add(attemptId); scope(tribeId)[outcome] += 1; };
    const deliveries: MessageDeliveryRepository = {
      claim: async (command) => {
        if (incomplete) return [];
        let tribes = [...scopes.keys()];
        return measure(MESSAGE_DISPATCH_OBSERVATION_PHASE.claim, () => tribes, async () => {
          const claims = await this.deliveries.claim(command); tribes = claims.length ? [...new Set(claims.map((claim) => claim.tribeId))] : tribes;
          for (const claim of claims) { scope(claim.tribeId).claimed += 1; deliveryScopes.set(claim.deliveryId, claim.tribeId); }
          return claims;
        });
      },
      authorize: (claim, requestId) => measure(MESSAGE_DISPATCH_OBSERVATION_PHASE.authorize, () => [claim.tribeId], async () => {
        const result = await this.deliveries.authorize(claim, requestId);
        if (!closed) { const counters = scope(claim.tribeId); if (result.outcome === MESSAGE_AUTHORIZATION_OUTCOME.authorized) counters.authorized += 1; else if (result.outcome === MESSAGE_AUTHORIZATION_OUTCOME.suppressed) counters.suppressed += 1; else if (result.outcome === MESSAGE_AUTHORIZATION_OUTCOME.quotaExceeded) counters.quotaDeferred += 1; else counters.unresolved += 1; }
        return result;
      }),
      complete: (receipt) => measure(MESSAGE_DISPATCH_OBSERVATION_PHASE.complete, () => [receipt.context.tribeId], async () => {
        receipts.set(receipt.context.attemptId, { outcome: receipt.outcome, providerMessageId: receipt.providerMessageId });
        const result = await this.deliveries.complete(receipt);
        if (result.outcome === MESSAGE_COMPLETION_OUTCOME.completed || result.outcome === MESSAGE_COMPLETION_OUTCOME.unchanged) confirm(receipt.context.tribeId, receipt.context.attemptId, receipt.outcome);
        return result;
      }),
      readAttempt: (context) => measure(MESSAGE_DISPATCH_OBSERVATION_PHASE.complete, () => [context.tribeId], async () => {
        const attempt = await this.deliveries.readAttempt(context);
        const receipt = receipts.get(context.attemptId);
        const confirmed = attempt && attempt.providerMessageId === receipt?.providerMessageId && (attempt.state === receipt.outcome || attempt.state === MESSAGE_ATTEMPT_STATE.delivered && receipt.outcome === MESSAGE_ATTEMPT_STATE.accepted);
        if (confirmed && attempt.state !== MESSAGE_ATTEMPT_STATE.inFlight) confirm(context.tribeId, context.attemptId, attempt.state);
        return attempt;
      }),
      reconcileExpiredLeases: (limit) => this.deliveries.reconcileExpiredLeases(limit),
    };
    const sender: MessageDeliverySender = { prepare: (context, signal) => measure(MESSAGE_DISPATCH_OBSERVATION_PHASE.prepare, () => [context.tribeId], async () => {
      const prepared = await this.sender.prepare(context, signal);
      return { send: (sendSignal) => measure(MESSAGE_DISPATCH_OBSERVATION_PHASE.send, () => [context.tribeId], () => prepared.send(sendSignal)) };
    }) };
    const runtime: MessagingDispatchRuntime = { now: () => this.runtime.now(), createId: () => this.runtime.createId(), report: (diagnostic) => {
      incomplete ||= diagnostic.stage !== MESSAGING_DISPATCH_STAGE.complete;
      this.runtime.report(diagnostic);
    }, defer: (work, context) => {
      const at = this.runtime.now(), sampleId = this.runtime.createId(), deferSampleId = this.runtime.createId();
      const tribeIds = context?.tribeIds ?? (() => { const tribeId = context?.deliveryId ? deliveryScopes.get(context.deliveryId) : this.focalTribeId; return tribeId ? [tribeId] : []; });
      let deferDurationMs = 0;
      const deferSamples = () => [...new Set(tribeIds())].map((tribeId) => ({ sampleId: deferSampleId, tribeId, phase: MESSAGE_DISPATCH_OBSERVATION_PHASE.defer, durationMs: deferDurationMs }));
      const retained = work.finally(() => { const samples: MessageDispatchPhaseSample[] = [...new Set(tribeIds())].map((tribeId) => ({ sampleId, tribeId, phase: MESSAGE_DISPATCH_OBSERVATION_PHASE.late, durationMs: Math.max(0, Math.ceil(this.runtime.now() - at)) })); samples.push(...deferSamples()); keepSamples(samples); });
      try { this.runtime.defer(retained, context); }
      finally { deferDurationMs = Math.max(0, Math.ceil(this.runtime.now() - at)); keepSamples(deferSamples()); }
    } };
    const result = await new DispatchMessageDeliveriesUseCase(deliveries, sender, { ...this.settings, runBudgetMs: workBudgetMs }, runtime).execute();
    closed = true;
    const workerOutcome = incomplete || result.unresolved > 0 || result.deadlineReached ? MESSAGE_DISPATCH_RUN_OUTCOME.incomplete : MESSAGE_DISPATCH_RUN_OUTCOME.completed;
    const runs: MessageDispatchTribeRun[] = [...scopes].map(([tribeId, counts]) => ({ tribeId, outcome: workerOutcome, counters: { ...selectedCounters(counts), deadlineReached: result.deadlineReached } }));
    const observationOutcome = await this.finishRun(startedAt, () => { persistence = this.recorder.finish(start, runs, phases, recordBudgetMs); return persistence; });
    result.elapsedMs = Math.max(0, this.runtime.now() - startedAt);
    result.deadlineReached ||= result.elapsedMs >= this.settings.runBudgetMs;
    return { ...result, workerOutcome: observationOutcome === MESSAGE_DISPATCH_OBSERVATION_OUTCOME.unavailable || result.deadlineReached ? MESSAGE_DISPATCH_RUN_OUTCOME.incomplete : workerOutcome, observationOutcome };
  }
}
