/** Runs bounded portable outbox work with RPC outside persistence and no ambiguous resend. @module dispatch-message-deliveries-use-case */
import type { ClaimedMessageDelivery, MessageDeliveryAuthorization, MessageDeliveryCompletion, MessageDeliveryRepository, MessageDeliveryReceipt } from "@/src/modules/messaging/domain/repositories/message-delivery-repository";
import type { MessageDeliveryAttempt } from "@/src/modules/messaging/domain/entities/message-delivery-attempt";
import type { MessageDeliverySender, PreparedMessageDeliverySender, MessagingDispatchRuntime, MessagingDispatchSettings, MessagingDispatchDeferredContext } from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessageDispatchRunResult } from "@/src/modules/messaging/application/results/message-dispatch-result";
import { MESSAGE_ATTEMPT_STATE, MESSAGE_AUTHORIZATION_OUTCOME, MESSAGE_COMPLETION_OUTCOME, MESSAGE_RECEIPT_REASON, MESSAGE_STORAGE_OPERATION  } from "@/src/modules/messaging/constants/message-delivery";
import { MESSAGING_DISPATCH_STAGE } from "@/src/modules/messaging/constants/messaging-dispatch";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { MessagingDeliveryStorageError } from "@/src/modules/messaging/domain/errors/messaging-delivery-storage-error";
import { MessagingDispatchDeadlineError } from "@/src/modules/messaging/domain/errors/messaging-dispatch-deadline-error";
import { observeWithin, type ObservedWithinDeadline } from "./observe-dispatch-deadline";

/** Shared mutable state of one active dispatch run; `stopNewWork` ends claiming once any attempt reaches a limit. */
type DispatchRun = { result: MessageDispatchRunResult; deadlineAt: number; stopNewWork: boolean };

/** Authorized context of one attempt and the cancellation that bounds its preparation and request. */
type DispatchAttempt = { context: AuthorizedDeliveryMessagingContext; controller: AbortController };

/** @param context - Authorized attempt whose provider outcome cannot be confirmed. @returns The explicit unknown receipt for that attempt. */
function unknownReceipt(context: AuthorizedDeliveryMessagingContext): MessageDeliveryReceipt {
  return { context, outcome: MESSAGE_ATTEMPT_STATE.unknown, providerMessageId: null, correlationId: null, reason: MESSAGE_RECEIPT_REASON.unknown };
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
  private retain(work: Promise<void>, context?: MessagingDispatchDeferredContext): void {
    const identity = context ? { deliveryId: context.deliveryId, attemptId: context.attemptId } : {};
    const observed = work.catch((error: unknown) => { this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.late, ...identity, cause: error }); });
    try { this.runtime.defer(observed, context); }
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
      const sameEvidence = current?.state === receipt.outcome && current.providerMessageId === receipt.providerMessageId;
      const strongerEvidence = current?.state === MESSAGE_ATTEMPT_STATE.delivered && receipt.outcome === MESSAGE_ATTEMPT_STATE.accepted && current.providerMessageId === receipt.providerMessageId;
      if (current && (sameEvidence || strongerEvidence)) { if (result && current.state !== MESSAGE_ATTEMPT_STATE.inFlight) result[current.state] += 1; return; }
    } catch (error) { this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.complete, deliveryId: receipt.context.deliveryId, attemptId: receipt.context.attemptId, cause: error }); }
    if (result) result.unresolved += 1;
    else this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.late, deliveryId: receipt.context.deliveryId, attemptId: receipt.context.attemptId, cause: new MessagingDeliveryStorageError(MESSAGING_ERROR_CODE.operationUnresolved, { operation: MESSAGE_STORAGE_OPERATION.complete, deliveryId: receipt.context.deliveryId, attemptId: receipt.context.attemptId }) });
  }

  /**
   * Authorizes one claim within the run deadline, counting every outcome that ends its processing.
   * @param run - Shared state of the active run.
   * @param claim - Claimed obligation awaiting its authorization marker.
   * @returns The authorized private delivery context, or null when processing ends here.
   */
  private async authorizeClaim(run: DispatchRun, claim: ClaimedMessageDelivery): Promise<AuthorizedDeliveryMessagingContext | null> {
    const { result } = run;
    const authorizationWork = this.deliveries.authorize(claim, this.runtime.createId());
    let authorization: ObservedWithinDeadline<MessageDeliveryAuthorization>;
    try { authorization = await observeWithin(authorizationWork, run.deadlineAt - this.runtime.now()); }
    catch (error) {
      result.unresolved += 1;
      this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.authorize, deliveryId: claim.deliveryId, cause: error });
      return null;
    }
    if (!authorization.settled) {
      run.stopNewWork = true; result.deadlineReached = true; result.unresolved += 1;
      this.retain(authorizationWork.then(async (late) => { if (late.outcome === MESSAGE_AUTHORIZATION_OUTCOME.authorized) await this.record(unknownReceipt(late.context)); }), { deliveryId: claim.deliveryId });
      return null;
    }
    const value = authorization.value;
    if (value.outcome !== MESSAGE_AUTHORIZATION_OUTCOME.authorized) {
      if (value.outcome === MESSAGE_AUTHORIZATION_OUTCOME.suppressed) result.suppressed += 1;
      else if (value.outcome === MESSAGE_AUTHORIZATION_OUTCOME.quotaExceeded) result.quotaDeferred += 1;
      else result.unresolved += 1;
      return null;
    }
    result.authorized += 1;
    return value.context;
  }

  /**
   * Prepares the sender for one authorized delivery, recording an unknown receipt when preparation cannot finish.
   * @param run - Shared state of the active run.
   * @param attempt - Authorized context and the cancellation owned by this attempt.
   * @param remaining - Run time left when preparation starts.
   * @returns The prepared sender, or null after the unknown outcome was recorded.
   */
  private async prepareSender(run: DispatchRun, attempt: DispatchAttempt, remaining: number): Promise<PreparedMessageDeliverySender | null> {
    const { context, controller } = attempt;
    const preparing = Promise.resolve().then(() => this.sender.prepare(context, controller.signal));
    let preparation: ObservedWithinDeadline<PreparedMessageDeliverySender>;
    try { preparation = await observeWithin(preparing, remaining, () => controller.abort(new MessagingDispatchDeadlineError(MESSAGING_DISPATCH_STAGE.prepare, remaining))); }
    catch (error) {
      run.stopNewWork = true; controller.abort();
      this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.prepare, deliveryId: context.deliveryId, attemptId: context.attemptId, cause: error });
      await this.record(unknownReceipt(context), run.result, run.deadlineAt); return null;
    }
    if (!preparation.settled) {
      run.stopNewWork = true; run.result.deadlineReached = true;
      this.runtime.report({stage:MESSAGING_DISPATCH_STAGE.prepare,deliveryId:context.deliveryId,attemptId:context.attemptId,cause:controller.signal.reason});
      await this.record(unknownReceipt(context), run.result, run.deadlineAt);
      this.retain(preparing.then(() => undefined), context); return null;
    }
    return preparation.value;
  }

  /**
   * Sends one prepared request and records its receipt, retaining a late answer instead of resending.
   * @param run - Shared state of the active run.
   * @param attempt - Authorized context and the cancellation owned by this attempt.
   * @param preparedSender - Sender prepared for this exact attempt.
   * @param rpcRemaining - Run time left when the request starts.
   * @returns Nothing after the receipt, or an unknown outcome, was recorded.
   */
  private async sendPrepared(run: DispatchRun, attempt: DispatchAttempt, preparedSender: PreparedMessageDeliverySender, rpcRemaining: number): Promise<void> {
    const { context, controller } = attempt;
    // The request owns its full provider timeout. A shorter remaining run only ends this observation:
    // aborting the request there would turn a provider answer that is merely slow into a permanent unknown.
    const requestTimer = setTimeout(() => controller.abort(new MessagingDispatchDeadlineError(MESSAGING_DISPATCH_STAGE.send, this.settings.requestTimeoutMs)), this.settings.requestTimeoutMs);
    const sending = Promise.resolve().then(() => preparedSender.send(controller.signal));
    const clearRequestTimer = () => clearTimeout(requestTimer);
    sending.then(clearRequestTimer).catch(clearRequestTimer);
    let observation: ObservedWithinDeadline<Omit<MessageDeliveryReceipt, "context">>;
    const rpcObservationMs=Math.min(this.settings.requestTimeoutMs,rpcRemaining);
    try { observation = await observeWithin(sending, rpcObservationMs); }
    catch (error) {
      run.stopNewWork = true; controller.abort();
      this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.send, deliveryId: context.deliveryId, attemptId: context.attemptId, cause: error });
      await this.record(unknownReceipt(context), run.result, run.deadlineAt);
      return;
    }
    if (!observation.settled) {
      // An uncooperative sender must not free capacity for additional POSTs after its timeout.
      run.stopNewWork = true; run.result.deadlineReached = this.runtime.now() >= run.deadlineAt;
      this.runtime.report({stage:MESSAGING_DISPATCH_STAGE.send,deliveryId:context.deliveryId,attemptId:context.attemptId,cause:controller.signal.aborted ? controller.signal.reason : new MessagingDispatchDeadlineError(MESSAGING_DISPATCH_STAGE.observation, rpcObservationMs)});
      await this.record(unknownReceipt(context), run.result, run.deadlineAt);
      this.retain(sending.then((late) => this.record({ ...late, context })), context);
      return;
    }
    await this.record({ ...observation.value, context }, run.result, run.deadlineAt);
  }

  /**
   * Processes one claim: authorization, sender preparation and a single provider request.
   * @param run - Shared state of the active run.
   * @param claim - Claimed obligation.
   * @returns Nothing after its outcome was counted or recorded.
   */
  private async processClaim(run: DispatchRun, claim: ClaimedMessageDelivery): Promise<void> {
    const context = await this.authorizeClaim(run, claim);
    if (!context) return;
    const remaining = run.deadlineAt - this.runtime.now();
    if (run.stopNewWork || remaining <= 0) { run.stopNewWork = true; run.result.deadlineReached ||= remaining <= 0; await this.record(unknownReceipt(context), run.result, run.deadlineAt); return; }
    const attempt: DispatchAttempt = { context, controller: new AbortController() };
    const preparedSender = await this.prepareSender(run, attempt, remaining);
    if (!preparedSender) return;
    const rpcRemaining = run.deadlineAt - this.runtime.now();
    if (run.stopNewWork || rpcRemaining <= 0) { attempt.controller.abort(); run.stopNewWork = true; run.result.deadlineReached ||= rpcRemaining <= 0; await this.record(unknownReceipt(context), run.result, run.deadlineAt); return; }
    await this.sendPrepared(run, attempt, preparedSender, rpcRemaining);
  }

  /**
   * Claims the next batch within the run deadline, retaining a late claim instead of repeating it.
   * @param run - Shared state of the active run.
   * @param capacity - Free concurrency slots.
   * @returns The claimed batch, or null when claiming failed or outlived the deadline and the run must stop.
   */
  private async claimBatch(run: DispatchRun, capacity: number): Promise<ClaimedMessageDelivery[] | null> {
    const { result } = run;
    const claiming = this.deliveries.claim({ leaseToken: this.runtime.createId(), limit: Math.min(this.settings.batchLimit, capacity), leaseSeconds: this.settings.leaseSeconds });
    let claims: ObservedWithinDeadline<ClaimedMessageDelivery[]>;
    try { claims = await observeWithin(claiming, run.deadlineAt - this.runtime.now()); }
    catch (error) { result.unresolved += 1; this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.claim, cause: error }); return null; }
    if (!claims.settled) { result.unresolved += 1; result.deadlineReached = true; let originalClaims: ClaimedMessageDelivery[] = []; this.retain(claiming.then((late) => { originalClaims = late; }), { tribeIds: () => originalClaims.map((claim) => claim.tribeId) }); return null; }
    return claims.value;
  }

  /**
   * Processes due work within the specification bounds, preserving marked uncertainty and late evidence.
   * @returns Confirmed per-state counts and explicit unresolved/deadline telemetry.
   */
  async execute(): Promise<MessageDispatchRunResult> {
    const startedAt = this.runtime.now(), deadlineAt = startedAt + this.settings.runBudgetMs;
    const result: MessageDispatchRunResult = { claimed: 0, authorized: 0, accepted: 0, delivered: 0, rejected: 0, unknown: 0, suppressed: 0, quotaDeferred: 0, unresolved: 0, deadlineReached: false, elapsedMs: 0 };
    const active = new Set<Promise<void>>();
    const run: DispatchRun = { result, deadlineAt, stopNewWork: false };
    while (!run.stopNewWork && this.runtime.now() < deadlineAt) {
      if (active.size >= this.settings.concurrency) { await Promise.race(active); continue; }
      const claims = await this.claimBatch(run, this.settings.concurrency - active.size);
      if (!claims) break;
      if (!claims.length) { if (!active.size) break; await Promise.race(active); continue; }
      result.claimed += claims.length;
      if (run.stopNewWork || this.runtime.now() >= deadlineAt) { result.unresolved += claims.length; result.deadlineReached ||= this.runtime.now() >= deadlineAt; break; }
      for (const claim of claims) {
        const task = this.processClaim(run, claim).catch((error: unknown) => { result.unresolved += 1; this.runtime.report({ stage: MESSAGING_DISPATCH_STAGE.send, deliveryId: claim.deliveryId, cause: error }); }).finally(() => { active.delete(task); });
        active.add(task);
      }
    }
    await Promise.all(active);
    result.elapsedMs = Math.max(0, this.runtime.now() - startedAt);
    result.deadlineReached ||= result.elapsedMs >= this.settings.runBudgetMs;
    return result;
  }
}
