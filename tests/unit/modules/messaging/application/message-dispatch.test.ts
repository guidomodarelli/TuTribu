/** @vitest-environment node */
/** Exercises bounded scheduling and confirmed/uncertain progress through own ports and real timers. @module message-dispatch-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DispatchMessageDeliveriesUseCase } from "@/src/modules/messaging/application/use-cases/dispatch-message-deliveries-use-case";
import { createMessagingDispatchConfig } from "@/src/modules/messaging/infrastructure/config/messaging-dispatch-config";
import type { MessageDeliveryRepository, ClaimedMessageDelivery, MessageDeliveryReceipt } from "@/src/modules/messaging/domain/repositories/message-delivery-repository";
import type { MessagingDispatchDiagnostic } from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import type { AuthorizedDeliveryMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
/** Own immediate-preparation transport test port; production uses a separate transient prepared operation. */
type OwnRpcSender={send(context:AuthorizedDeliveryMessagingContext,signal:AbortSignal):Promise<Omit<MessageDeliveryReceipt,"context">>};

/**
 * Supplies own scheduling ports; no library, SDK, SQL transport or UI platform is mocked.
 * @param count - Number of due synthetic obligations.
 * @returns Own queue/receipt observations, bounded runtime and a dispatcher factory.
 */
function fixture(count: number) {
  const queue: ClaimedMessageDelivery[] = Array.from({ length: count }, () => ({ deliveryId: randomUUID(), tribeId: randomUUID(), version: 2, leaseToken: randomUUID(), contributingLeaderUserId: randomUUID() }));
  const receipts: MessageDeliveryReceipt[] = [];
  const diagnostics: MessagingDispatchDiagnostic[] = [];
  const deferred: Promise<void>[] = [];
  const markers = new Map<string, AuthorizedDeliveryMessagingContext>();
  let insidePersistence = false;
  const repository: MessageDeliveryRepository = {
    async claim(command) { return queue.splice(0,command.limit).map((claim) => ({ ...claim, leaseToken: command.leaseToken })); },
    async authorize(claim, requestId) {
      insidePersistence = true;
      const context: AuthorizedDeliveryMessagingContext = { authorizationPurpose: "authorized_delivery", contributingLeaderUserId: claim.contributingLeaderUserId!, tribeId: claim.tribeId, connectionId: randomUUID(), connectionVersion: 1, environment: "synthetic", securityEpoch: "synthetic-epoch", requestId, secretRef: randomUUID(), deliveryId: claim.deliveryId, attemptId: randomUUID(), attemptVersion: 1, leaseToken: claim.leaseToken, sendAuthorizedAt: new Date(), authorizedUsagePolicyVersion: 1, operation: "dispatch_delivery" };
      markers.set(claim.deliveryId, context);
      insidePersistence = false;
      return { outcome: "authorized", context, deliveryVersion: 3 };
    },
    async complete(receipt) { receipts.push(receipt); return { outcome: "completed", attemptVersion: 2, deliveryVersion: 4 }; },
    async readAttempt() { return null; },
    async reconcileExpiredLeases() { return 0; },
  };
  const settings = createMessagingDispatchConfig({ requestTimeoutMs: 30, runBudgetMs: 150, leaseSeconds: 1 });
  const runtime = { now: () => Date.now(), createId: randomUUID, defer: (work: Promise<void>) => { deferred.push(work); }, report: (diagnostic: MessagingDispatchDiagnostic) => { diagnostics.push(diagnostic); } };
  return { queue, receipts, diagnostics, deferred, markers, repository, settings, runtime, get insidePersistence() { return insidePersistence; }, dispatcher: (sender: OwnRpcSender) => new DispatchMessageDeliveriesUseCase(repository, {prepare:async(context)=>({send:(signal)=>sender.send(context,signal)})}, settings, runtime) };
}

describe("portable message dispatcher", () => {
  it("should reserve the request timeout for the actual SDK RPC after slower local preparation within the unchanged run budget", async () => {
    const state=fixture(1),providerMessageId=randomUUID(),settings=createMessagingDispatchConfig({...state.settings,runBudgetMs:300});
    const transport=createAdmissionProviderTransport([{origin:"https://api.zavu.dev",pathname:"/v1/messages",method:"POST",respond:()=>Response.json({message:{id:providerMessageId,direction:"outbound",channel:"email",status:"sent"}})}]);
    const sender=new ZavuMessageDeliverySender({async prepare(context){await new Promise<void>((resolve)=>setTimeout(resolve,60));return{credential:randomUUID(),intent:{deliveryId:context.deliveryId,attemptId:context.attemptId,connectionId:context.connectionId,connectionVersion:context.connectionVersion,environment:context.environment,securityEpoch:context.securityEpoch,channel:"email",senderId:randomUUID(),recipient:"synthetic@example.test",code:"429017",idempotencyKey:randomUUID(),templateId:null,templateLanguage:null}};}},transport.fetch);
    const result=await new DispatchMessageDeliveriesUseCase(state.repository,sender,settings,state.runtime).execute();await Promise.all(state.deferred);
    expect(result).toMatchObject({authorized:1,accepted:1,unknown:0,unresolved:0});expect(transport.receipts).toHaveLength(1);expect(state.receipts).toHaveLength(1);expect(state.receipts[0]).toMatchObject({outcome:"accepted",providerMessageId});
  });
  it("should preserve the original uncertainty and never start SDK when local preparation finishes after the run deadline", async () => {
    const state=fixture(1),settings=createMessagingDispatchConfig({...state.settings,runBudgetMs:150}),transport=createAdmissionProviderTransport([]);
    const sender=new ZavuMessageDeliverySender({async prepare(context){await new Promise<void>((resolve)=>setTimeout(resolve,220));return{credential:randomUUID(),intent:{deliveryId:context.deliveryId,attemptId:context.attemptId,connectionId:context.connectionId,connectionVersion:context.connectionVersion,environment:context.environment,securityEpoch:context.securityEpoch,channel:"email",senderId:randomUUID(),recipient:"synthetic@example.test",code:"429017",idempotencyKey:randomUUID(),templateId:null,templateLanguage:null}};}},transport.fetch);
    const result=await new DispatchMessageDeliveriesUseCase(state.repository,sender,settings,state.runtime).execute();await Promise.all(state.deferred);
    expect(result).toMatchObject({authorized:1,accepted:0,unknown:1,unresolved:0,deadlineReached:true});expect(transport.receipts).toHaveLength(0);expect(transport.deniedRequests).toBe(0);expect(state.receipts).toHaveLength(1);expect(state.receipts[0].context.attemptId).toBe([...state.markers.values()][0].attemptId);
    expect(state.diagnostics).toContainEqual(expect.objectContaining({stage:"prepare",cause:expect.objectContaining({name:"MessagingDispatchDeadlineError",code:"transport_timeout",stage:"prepare",durationMs:expect.any(Number)})}));
  });
  it("should use specification defaults and reject capacity/lease settings that break the run limits", () => {
    expect(createMessagingDispatchConfig()).toEqual({ requestTimeoutMs: 15_000, runBudgetMs: 45_000, leaseSeconds: 90, concurrency: 2, batchLimit: 2 });
    for (const input of [{ concurrency: 3 }, { concurrency: 0 }, { batchLimit: 101 }, { leaseSeconds: 301 }, { leaseSeconds: 45 }, { requestTimeoutMs: 15_001 }, { runBudgetMs: 45_001 }, { requestTimeoutMs: Number.NaN }]) expect(() => createMessagingDispatchConfig(input)).toThrow(expect.objectContaining({ code: "invalid_input" }));
  });

  it("should enter sender only after each committed marker and keep at most two send requests active", async () => {
    const state = fixture(5);
    let active = 0, maximum = 0;
    const sender: OwnRpcSender = { async send(context) {
      expect(state.insidePersistence).toBe(false);
      expect(state.markers.get(context.deliveryId)?.attemptId).toBe(context.attemptId);
      active += 1; maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" };
    } };
    const result = await state.dispatcher(sender).execute();
    expect(result).toMatchObject({ claimed: 5, authorized: 5, accepted: 5, unknown: 0, unresolved: 0 });
    expect(maximum).toBe(2);
    expect(state.receipts).toHaveLength(5);
  });

  it("should stop new POSTs on an uncooperative timeout and record a late result for that same attempt", async () => {
    const state = fixture(5);
    const pending = new Map<string, (value: Omit<MessageDeliveryReceipt, "context">) => void>();
    const sender: OwnRpcSender = { send(context) { return new Promise((resolve) => { pending.set(context.attemptId, resolve); }); } };
    const result = await state.dispatcher(sender).execute();
    expect(result).toMatchObject({ claimed: 2, authorized: 2, unknown: 2, accepted: 0 });
    expect(pending.size).toBe(2);
    expect(state.queue).toHaveLength(3);
    const contexts = state.receipts.map((receipt) => receipt.context);
    for (const context of contexts) pending.get(context.attemptId)!({ outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" });
    await Promise.all(state.deferred);
    expect(state.receipts.filter((receipt) => receipt.outcome === "accepted").map((receipt) => receipt.context.attemptId).sort()).toEqual(contexts.map((context) => context.attemptId).sort());
    expect(result.accepted).toBe(0);
    expect(pending.size).toBe(2);
  });

  it("should persist uncertainty when sender throws after marker rather than leaving a silent in-flight attempt", async () => {
    const state = fixture(1);
    const result = await state.dispatcher({ async send() { throw new Error("Synthetic transport lost after marker"); } }).execute();
    expect(result).toMatchObject({ authorized: 1, unknown: 1, unresolved: 0 });
    expect(state.receipts).toHaveLength(1);
    expect(state.receipts[0]).toMatchObject({ outcome: "unknown", providerMessageId: null });
  });

  it("should not enter another sender when its marker completes after an earlier sender timed out", async () => {
    const state = fixture(3);
    const authorize = state.repository.authorize;
    let authorizations = 0, sends = 0;
    state.repository.authorize = async (claim, requestId) => {
      authorizations += 1;
      if (authorizations === 2) await new Promise<void>((resolve) => setTimeout(resolve, 70));
      return authorize(claim, requestId);
    };
    const result = await state.dispatcher({ send() { sends += 1; return new Promise(() => undefined); } }).execute();
    expect(sends).toBe(1);
    expect(result).toMatchObject({ authorized: 2, unknown: 2 });
    expect(state.queue).toHaveLength(1);
  });

  it("should report late evidence that fails CAS and cannot be confirmed by the original attempt read", async () => {
    const state = fixture(1);
    let finish!: (value: Omit<MessageDeliveryReceipt, "context">) => void;
    const result = await state.dispatcher({ send() { return new Promise((resolve) => { finish = resolve; }); } }).execute();
    expect(result.unknown).toBe(1);
    state.repository.complete = async () => ({ outcome: "stale", attemptVersion: 2, deliveryVersion: 4 });
    finish({ outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" });
    await Promise.all(state.deferred);
    expect(state.diagnostics).toContainEqual(expect.objectContaining({ stage: "late", deliveryId: expect.any(String), attemptId: expect.any(String), cause: expect.objectContaining({ code: "operation_unresolved" }) }));
    expect(result.accepted).toBe(0);
  });

  it("should finish the run when receipt persistence never settles while preserving registered uncertainty", async () => {
    const state = fixture(1);
    state.repository.complete = () => new Promise(() => undefined);
    const started = Date.now();
    const result = await state.dispatcher({ async send() { return { outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" }; } }).execute();
    expect(result).toMatchObject({ authorized: 1, accepted: 0, unresolved: 1, deadlineReached: true });
    expect(Date.now()-started).toBeLessThan(500);
  }, 1_000);

  it("should reconcile a stale completion after the run deadline with the original identity and no second completion or send", async () => {
    const state = fixture(1);
    let finish!: (completion: Awaited<ReturnType<MessageDeliveryRepository["complete"]>>) => void;
    let completions = 0, reads = 0, sends = 0;
    state.repository.complete = () => { completions += 1; return new Promise((resolve) => { finish = resolve; }); };
    state.repository.readAttempt = async () => { reads += 1; return null; };
    const result = await state.dispatcher({ async send() { sends += 1; return { outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" }; } }).execute();
    const published = { ...result };
    const original = [...state.markers.values()][0];
    expect(result).toMatchObject({ accepted: 0, unresolved: 1, deadlineReached: true });
    finish({ outcome: "stale", attemptVersion: 2, deliveryVersion: 4 });
    await Promise.all(state.deferred);
    expect(reads).toBe(1);
    expect(state.diagnostics).toContainEqual(expect.objectContaining({ stage: "late", deliveryId: original.deliveryId, attemptId: original.attemptId, cause: expect.objectContaining({ code: "operation_unresolved" }) }));
    expect(completions).toBe(1);
    expect(sends).toBe(1);
    expect(result).toEqual(published);
  });

  it("should report an unconfirmed attempt when its already started recovery read returns null after the deadline", async () => {
    const state = fixture(1);
    let finish!: (attempt: Awaited<ReturnType<MessageDeliveryRepository["readAttempt"]>>) => void;
    let reads = 0, sends = 0;
    state.repository.complete = async () => ({ outcome: "stale", attemptVersion: 2, deliveryVersion: 4 });
    state.repository.readAttempt = () => { reads += 1; return new Promise((resolve) => { finish = resolve; }); };
    const result = await state.dispatcher({ async send() { sends += 1; return { outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" }; } }).execute();
    const published = { ...result };
    const original = [...state.markers.values()][0];
    finish(null);
    await Promise.all(state.deferred);
    expect(state.diagnostics).toContainEqual(expect.objectContaining({ stage: "late", deliveryId: original.deliveryId, attemptId: original.attemptId, cause: expect.objectContaining({ code: "operation_unresolved" }) }));
    expect(reads).toBe(1);
    expect(sends).toBe(1);
    expect(result).toEqual(published);
  });

  it("should retain a confirmed late completion without republishing the earlier run counters", async () => {
    const state = fixture(1);
    let finish!: (completion: Awaited<ReturnType<MessageDeliveryRepository["complete"]>>) => void;
    let completions = 0, reads = 0, sends = 0;
    state.repository.complete = () => { completions += 1; return new Promise((resolve) => { finish = resolve; }); };
    state.repository.readAttempt = async () => { reads += 1; return null; };
    const result = await state.dispatcher({ async send() { sends += 1; return { outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" }; } }).execute();
    const published = { ...result };
    finish({ outcome: "completed", attemptVersion: 2, deliveryVersion: 4 });
    await Promise.all(state.deferred);
    expect(state.diagnostics).toEqual([]);
    expect(reads).toBe(0);
    expect(completions).toBe(1);
    expect(sends).toBe(1);
    expect(result).toEqual(published);
  });

  it("should report a late sender rejection using only delivery and attempt identity from the private context", async () => {
    const state = fixture(1);
    let fail!: (error: Error) => void;
    const cause = new Error("Synthetic late provider response loss");
    const result = await state.dispatcher({ send() { return new Promise((_resolve, reject) => { fail = reject; }); } }).execute();
    const original = [...state.markers.values()][0];
    fail(cause);
    await Promise.all(state.deferred);
    const diagnostic = state.diagnostics.find((entry) => entry.stage === "late");
    expect(diagnostic).toEqual({ stage: "late", deliveryId: original.deliveryId, attemptId: original.attemptId, cause });
    expect(result).toMatchObject({ unknown: 1, accepted: 0 });
  });

  it("should suppress or defer quota before entering sender and never pretend that those obligations were sent", async () => {
    const state = fixture(2);
    let authorized = 0, sends = 0;
    state.repository.authorize = async (claim) => ({ outcome: authorized++ === 0 ? "suppressed" : "quota_exceeded", deliveryId: claim.deliveryId, deliveryVersion: 3 });
    const result = await state.dispatcher({ async send() { sends += 1; return { outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" }; } }).execute();
    expect(result).toMatchObject({ suppressed: 1, quotaDeferred: 1, authorized: 0, accepted: 0 });
    expect(sends).toBe(0);
    expect(state.receipts).toEqual([]);
  });
});
