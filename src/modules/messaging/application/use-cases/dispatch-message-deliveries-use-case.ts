/** Runs bounded portable outbox work with RPC outside persistence and no ambiguous resend. @module dispatch-message-deliveries-use-case */
import type { ClaimedMessageDelivery, MessageDeliveryAuthorization, MessageDeliveryCompletion, MessageDeliveryRepository, MessageDeliveryReceipt } from "@/src/modules/messaging/domain/repositories/message-delivery-repository";
import type { MessageDeliveryAttempt } from "@/src/modules/messaging/domain/entities/message-delivery-attempt";
import type { MessageDeliverySender, PreparedMessageDeliverySender, MessagingDispatchRuntime, MessagingDispatchSettings } from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessageDispatchRunResult } from "@/src/modules/messaging/application/results/message-dispatch-result";
import { MESSAGE_ATTEMPT_STATE, MESSAGE_AUTHORIZATION_OUTCOME, MESSAGE_COMPLETION_OUTCOME, MESSAGE_RECEIPT_REASON } from "@/src/modules/messaging/constants/message-delivery";
import { MESSAGING_DISPATCH_STAGE } from "@/src/modules/messaging/constants/messaging-dispatch";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MESSAGE_STORAGE_OPERATION } from "@/src/modules/messaging/constants/message-delivery";
import { MessagingDeliveryStorageError } from "@/src/modules/messaging/domain/errors/messaging-delivery-storage-error";
import { MessagingDispatchDeadlineError } from "@/src/modules/messaging/domain/errors/messaging-dispatch-deadline-error";

/** A deadline ends observation; the underlying guarded write or RPC may still produce original evidence. */
type ObservedWithinDeadline<Value> = { settled: true; value: Value } | { settled: false };

/**
 * Observes one promise for a bounded duration without repeating or assuming cancellation of its effect.
 * @param work - Original already-started operation.
 * @param durationMs - Remaining deadline in milliseconds.
 * @param expire - Optional transport abort for that exact original request.
 * @returns Its actual value or an observation deadline, while late rejection remains handled.
 */
async function observeWithin<Value>(work: Promise<Value>, durationMs: number, expire?: () => void): Promise<ObservedWithinDeadline<Value>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<ObservedWithinDeadline<Value>>((resolve) => { timer = setTimeout(() => { expire?.(); resolve({ settled: false }); }, Math.max(0, durationMs)); });
  try { return await Promise.race([work.then((value) => ({ settled: true as const, value })), deadline]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

/** Owns scheduling only; injected adapters own current secret/payload/provider preparation. */
export class DispatchMessageDeliveriesUseCase {
  /**
   * @param deliveries - DB-only claims/markers/receipt port; every call commits before returning.
   * @param sender - Explicit prepared sender; no provider or fallback default is manufactured.
   * @param settings - Validated server-owned timeout, lease, concurrency and run limits.
   * @param runtime - Portable clock/identity/late-work retention and private diagnostics.
   */
  constructor(private readonly deliveries: MessageDeliveryRepository, private readonly sender: MessageDeliverySender, private readonly settings: Readonly<MessagingDispatchSettings>, private readonly runtime: MessagingDispatchRuntime) {}

  /**
   * Retains original late work under the host's lifecycle with a safe terminal diagnostic on rejection.
   * @param work - Original observation/finalization, never another POST.
   * @param context - Minimal original delivery/attempt identity when known.
   * @returns Nothing after retention, or after reporting a retention failure.
   */
  private retain(work: Promise<void>, context?: Pick<AuthorizedDeliveryMessagingContext, "deliveryId" | "attemptId">): void {
    const identity = context ? { deliveryId: context.deliveryId, attemptId: context.attemptId } : {};
    const observed = work.catch((error) => { this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.late, ...identity, cause: error }); });
    try { this.runtime.defer(observed); }
    catch (error) { this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.defer, ...identity, cause: error }); }
  }

  /**
   * Persists the actual original receipt and recovers confirmed state when its response was lost.
   * @param receipt - Safe evidence for the same attempt/lease.
   * @param result - Current run counters, omitted for host-retained work after the run returned.
   * @param deadlineAt - Optional active-run deadline; host-retained receipt work has its own lifecycle.
   * @param originalCompletion - Already started completion whose late result must be observed without another write.
   * @returns Nothing after counting only a confirmed outcome or explicit unresolved completion.
   */
  private async record(receipt: MessageDeliveryReceipt, result?: MessageDispatchRunResult, deadlineAt?: number, originalCompletion?: Promise<MessageDeliveryCompletion>): Promise<void> {
    try {
      const completing = originalCompletion ?? this.deliveries.complete(receipt);
      const observed = deadlineAt === undefined ? { settled: true as const, value: await completing } : await observeWithin(completing, deadlineAt - this.runtime.now());
      if (!observed.settled) {
        if (result) { result.unresolved += 1; result.deadlineReached = true; }
        this.retain(this.record(receipt, undefined, undefined, completing), receipt.context);
        return;
      }
      const completed = observed.value;
      if (completed.outcome === MESSAGE_COMPLETION_OUTCOME.completed || completed.outcome === MESSAGE_COMPLETION_OUTCOME.unchanged) { if (result) result[receipt.outcome] += 1; return; }
    } catch (error) { this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.complete, deliveryId: receipt.context.deliveryId, attemptId: receipt.context.attemptId, cause: error }); }
    await this.reconcileReceipt(receipt, result, deadlineAt);
  }

  /**
   * Checks the original attempt's evidence, retaining an already started late read without repeating it.
   * @param receipt - Actual receipt for the original attempt and lease.
   * @param result - Active-run counters, omitted after the run has been published.
   * @param deadlineAt - Active observation deadline; retained work has its host lifetime.
   * @param originalRead - Existing read whose late result still needs reconciliation.
   * @returns Nothing after confirmation or an identified unresolved diagnostic.
   */
  private async reconcileReceipt(receipt: MessageDeliveryReceipt, result?: MessageDispatchRunResult, deadlineAt?: number, originalRead?: Promise<MessageDeliveryAttempt | null>): Promise<void> {
    try {
      const reading = originalRead ?? this.deliveries.readAttempt(receipt.context);
      const observed = deadlineAt === undefined ? { settled: true as const, value: await reading } : await observeWithin(reading, deadlineAt - this.runtime.now());
      if (!observed.settled) {
        if (result) { result.unresolved += 1; result.deadlineReached = true; }
        this.retain(this.reconcileReceipt(receipt, undefined, undefined, reading), receipt.context);
        return;
      }
      const current = observed.value;
      const sameEvidence = current && current.state === receipt.outcome && current.providerMessageId === receipt.providerMessageId;
      const strongerEvidence = current && current.state === MESSAGE_ATTEMPT_STATE.delivered && receipt.outcome === MESSAGE_ATTEMPT_STATE.accepted && current.providerMessageId === receipt.providerMessageId;
      if (current && (sameEvidence || strongerEvidence)) { if (result && current.state !== MESSAGE_ATTEMPT_STATE.inFlight) result[current.state] += 1; return; }
    } catch (error) { this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.complete, deliveryId: receipt.context.deliveryId, attemptId: receipt.context.attemptId, cause: error }); }
    if (result) result.unresolved += 1;
    else this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.late, deliveryId: receipt.context.deliveryId, attemptId: receipt.context.attemptId, cause: new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.operationUnresolved, { operation: MESSAGE_STORAGE_OPERATION.complete, deliveryId: receipt.context.deliveryId, attemptId: receipt.context.attemptId }) });
  }

  /**
   * Processes due work within the specification bounds, preserving marked uncertainty and late evidence.
   * @returns Confirmed per-state counts and explicit unresolved/deadline telemetry.
   */
  async execute(): Promise<MessageDispatchRunResult> {
    const startedAt = this.runtime.now(), deadlineAt = startedAt + this.settings.runBudgetMs;
    const result: MessageDispatchRunResult = { claimed: 0, authorized: 0, accepted: 0, delivered: 0, rejected: 0, unknown: 0, suppressed: 0, quotaDeferred: 0, unresolved: 0, deadlineReached: false, elapsedMs: 0 };
    const active = new Set<Promise<void>>();
    let stopNewWork = false;
    const unknown = (context: AuthorizedDeliveryMessagingContext): MessageDeliveryReceipt => ({ context, outcome: MESSAGE_ATTEMPT_STATE.unknown, providerMessageId: null, correlationId: null, reason: MESSAGE_RECEIPT_REASON.unknown });
    const process = async (claim: ClaimedMessageDelivery) => {
      const authorizationWork = this.deliveries.authorize(claim, this.runtime.createId());
      let authorization: ObservedWithinDeadline<MessageDeliveryAuthorization>;
      try { authorization = await observeWithin(authorizationWork, deadlineAt - this.runtime.now()); }
      catch (error) {
        result.unresolved += 1;
        this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.authorize, deliveryId: claim.deliveryId, cause: error });
        return;
      }
      if (!authorization.settled) {
        stopNewWork = true; result.deadlineReached = true; result.unresolved += 1;
        this.retain(authorizationWork.then(async (late) => { if (late.outcome === MESSAGE_AUTHORIZATION_OUTCOME.authorized) await this.record(unknown(late.context)); }));
        return;
      }
      const value = authorization.value;
      if (value.outcome !== MESSAGE_AUTHORIZATION_OUTCOME.authorized) {
        if (value.outcome === MESSAGE_AUTHORIZATION_OUTCOME.suppressed) result.suppressed += 1;
        else if (value.outcome === MESSAGE_AUTHORIZATION_OUTCOME.quotaExceeded) result.quotaDeferred += 1;
        else result.unresolved += 1;
        return;
      }
      result.authorized += 1;
      const remaining = deadlineAt - this.runtime.now();
      if (stopNewWork || remaining <= 0) { stopNewWork = true; result.deadlineReached ||= remaining <= 0; await this.record(unknown(value.context), result, deadlineAt); return; }
      const controller = new AbortController();
      const preparing = Promise.resolve().then(() => this.sender.prepare(value.context, controller.signal));
      let preparation: ObservedWithinDeadline<PreparedMessageDeliverySender>;
      try { preparation = await observeWithin(preparing, remaining, () => controller.abort(new MessagingDispatchDeadlineError(MESSAGING_DISPATCH_STAGE.prepare, remaining))); }
      catch (error) {
        stopNewWork = true; controller.abort();
        this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.prepare, deliveryId: value.context.deliveryId, attemptId: value.context.attemptId, cause: error });
        await this.record(unknown(value.context), result, deadlineAt); return;
      }
      if (!preparation.settled) {
        stopNewWork = true; result.deadlineReached = true;
        this.runtime.report({stage:MESSAGING_DISPATCH_STAGE.prepare,deliveryId:value.context.deliveryId,attemptId:value.context.attemptId,cause:controller.signal.reason});
        await this.record(unknown(value.context), result, deadlineAt);
        this.retain(preparing.then(() => undefined), value.context); return;
      }
      const rpcRemaining = deadlineAt - this.runtime.now();
      if (stopNewWork || rpcRemaining <= 0) { controller.abort(); stopNewWork = true; result.deadlineReached ||= rpcRemaining <= 0; await this.record(unknown(value.context), result, deadlineAt); return; }
      const preparedSender=preparation.value;
      const sending = Promise.resolve().then(() => preparedSender.send(controller.signal));
      let observation: ObservedWithinDeadline<Omit<MessageDeliveryReceipt, "context">>;
      const rpcObservationMs=Math.min(this.settings.requestTimeoutMs,rpcRemaining);
      try { observation = await observeWithin(sending, rpcObservationMs, () => controller.abort(new MessagingDispatchDeadlineError(MESSAGING_DISPATCH_STAGE.send, rpcObservationMs))); }
      catch (error) {
        stopNewWork = true; controller.abort();
        this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.send, deliveryId: value.context.deliveryId, attemptId: value.context.attemptId, cause: error });
        await this.record(unknown(value.context), result, deadlineAt);
        return;
      }
      if (!observation.settled) {
        // An uncooperative sender must not free capacity for additional POSTs after its timeout.
        stopNewWork = true; result.deadlineReached = this.runtime.now() >= deadlineAt;
        this.runtime.report({stage:MESSAGING_DISPATCH_STAGE.send,deliveryId:value.context.deliveryId,attemptId:value.context.attemptId,cause:controller.signal.reason});
        await this.record(unknown(value.context), result, deadlineAt);
        this.retain(sending.then((late) => this.record({ ...late, context: value.context })), value.context);
        return;
      }
      await this.record({ ...observation.value, context: value.context }, result, deadlineAt);
    };
    while (!stopNewWork && this.runtime.now() < deadlineAt) {
      if (active.size >= this.settings.concurrency) { await Promise.race(active); continue; }
      const claiming = this.deliveries.claim({ leaseToken: this.runtime.createId(), limit: Math.min(this.settings.batchLimit, this.settings.concurrency - active.size), leaseSeconds: this.settings.leaseSeconds });
      let claims: ObservedWithinDeadline<ClaimedMessageDelivery[]>;
      try { claims = await observeWithin(claiming, deadlineAt - this.runtime.now()); }
      catch (error) { result.unresolved += 1; this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.claim, cause: error }); break; }
      if (!claims.settled) { result.unresolved += 1; result.deadlineReached = true; this.retain(claiming.then(() => undefined)); break; }
      if (!claims.value.length) { if (!active.size) break; await Promise.race(active); continue; }
      result.claimed += claims.value.length;
      if (stopNewWork || this.runtime.now() >= deadlineAt) { result.unresolved += claims.value.length; result.deadlineReached ||= this.runtime.now() >= deadlineAt; break; }
      for (const claim of claims.value) {
        const task = process(claim).catch((error) => { result.unresolved += 1; this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.send, deliveryId: claim.deliveryId, cause: error }); }).finally(() => { active.delete(task); });
        active.add(task);
      }
    }
    await Promise.all(active);
    result.elapsedMs = Math.max(0, this.runtime.now() - startedAt);
    result.deadlineReached ||= result.elapsedMs >= this.settings.runBudgetMs;
    return result;
  }
}
