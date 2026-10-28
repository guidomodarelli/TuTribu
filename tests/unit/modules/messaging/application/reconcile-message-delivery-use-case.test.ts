/** @vitest-environment node */
/** Exercises original-only reconciliation through own ports, without mocking SDK or framework libraries. @module reconcile-message-delivery-use-case-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ReconcileMessageDeliveryUseCase } from "@/src/modules/messaging/application/use-cases/reconcile-message-delivery-use-case";
import { reconcileMessageAttemptState } from "@/src/modules/messaging/domain/policies/message-status-observation";
import { MessagingConnectionInspectionError } from "@/src/modules/messaging/domain/errors/messaging-connection-inspection-error";
import { MessagingDeliveryStorageError } from "@/src/modules/messaging/domain/errors/messaging-delivery-storage-error";
import type { MessageReconciliationRepository } from "@/src/modules/messaging/domain/repositories/message-reconciliation-repository";
import type { MessagingAccountProvider, MessagingAuthenticatedAccount, AuthorizedMessagingContext } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { MessageStatusLookup, MessageStatusReference, MessageStatusObservation } from "@/src/modules/messaging/domain/repositories/message-status-lookup";
import type { ResolveMessagingContextUseCase } from "@/src/modules/messaging/application/use-cases/resolve-messaging-context-use-case";
import type { MessageDeliveryAttempt } from "@/src/modules/messaging/domain/entities/message-delivery-attempt";

/** @returns Controllable own ports and observable recorded calls, with stable native identity. */
function prepareReconciliation() {
  const now = new Date("2026-10-10T22:00:00Z");
  const account: MessagingAuthenticatedAccount = { userId: randomUUID(), session: { id: randomUUID(), expiresAt: new Date("2026-10-11T00:00:00Z") }, googleAccount: { id: randomUUID(), subject: randomUUID() } };
  const reference: MessageStatusReference = { tribeId: randomUUID(), connectionId: randomUUID(), connectionVersion: 1, deliveryId: randomUUID(), attemptId: randomUUID(), providerMessageId: randomUUID(), channel: "email", requestId: randomUUID() };
  const context: AuthorizedMessagingContext = { authorizationPurpose: "sensitive_leader", actorUserId: account.userId, sessionId: account.session.id, accountId: account.googleAccount!.id, subject: account.googleAccount!.subject, tribeId: reference.tribeId, connectionId: reference.connectionId, connectionVersion: 1, environment: "synthetic", securityEpoch: "synthetic-epoch", operation: "reconcile_message_delivery", resourceId: reference.connectionId, requestId: reference.requestId, secretRef: randomUUID() };
  const records: MessageStatusObservation[] = [];
  const accounts: MessagingAccountProvider = { getAuthenticatedAccount: async () => account };
  const repository: MessageReconciliationRepository<{ id: string; state: string }> = { readReference: async () => reference, record: async (authority, original, observation) => { expect(authority).toEqual(context); expect(original).toEqual(reference); records.push(observation); return { id: original.deliveryId, state: observation.outcome }; } };
  const resolver: Pick<ResolveMessagingContextUseCase, "execute"> = { execute: async () => ({ allowed: true, context }) };
  let reads = 0;
  const lookup: MessageStatusLookup = { read: async () => { reads += 1; return { outcome: "delivered", providerMessageId: reference.providerMessageId }; } };
  const cases = new ReconcileMessageDeliveryUseCase({ accounts, resolver, repository, lookup, clock: () => now });
  const query = { tribeId: reference.tribeId, deliveryId: reference.deliveryId, requestId: reference.requestId };
  return { cases, accounts, account, repository, resolver, context, lookup, reference, query, records, get reads() { return reads; } };
}

describe("original message reconciliation", () => {
  it("should select a stored identity and persist only the minimal observed transport", async () => {
    const fixture = prepareReconciliation();
    expect(await fixture.cases.execute(fixture.query, new AbortController().signal)).toEqual({ ok: true, value: { id: fixture.query.deliveryId, state: "delivered" } });
    expect(fixture.reads).toBe(1); expect(fixture.records).toEqual([{ outcome: "delivered", providerMessageId: fixture.reference.providerMessageId }]);
  });
  it("should reject an expired initial session before selecting or reading a provider message", async () => {
    const fixture = prepareReconciliation(); fixture.account.session.expiresAt = new Date("2026-10-10T21:00:00Z");
    expect(await fixture.cases.execute(fixture.query, new AbortController().signal)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
    expect(fixture.reads).toBe(0); expect(fixture.records).toEqual([]);
  });
  it("should reject a crossed stored resource without a provider call", async () => {
    const fixture = prepareReconciliation(); fixture.repository.readReference = async () => ({ ...fixture.reference, deliveryId: randomUUID() });
    expect(await fixture.cases.execute(fixture.query, new AbortController().signal)).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } }); expect(fixture.reads).toBe(0);
  });
  it("should reject a retired version instead of redirecting the original message to another version", async () => {
    const fixture = prepareReconciliation(); fixture.context.connectionVersion += 1;
    expect(await fixture.cases.execute(fixture.query, new AbortController().signal)).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } }); expect(fixture.reads).toBe(0);
  });
  it("should reject a provider observation for another message before persistence", async () => {
    const fixture = prepareReconciliation(); fixture.lookup.read = async () => ({ outcome: "delivered", providerMessageId: randomUUID() });
    expect(await fixture.cases.execute(fixture.query, new AbortController().signal)).toMatchObject({ ok: false, failure: { code: "upstream_payload_unusable" } }); expect(fixture.records).toEqual([]);
  });
  it("should recheck the original session after the provider read and preserve its receipt on revocation", async () => {
    const fixture = prepareReconciliation();
    fixture.lookup.read = async () => { fixture.resolver.execute = async () => ({ allowed: false, failure: { code: "authentication_required" } }); return { outcome: "delivered", providerMessageId: fixture.reference.providerMessageId }; };
    expect(await fixture.cases.execute(fixture.query, new AbortController().signal)).toMatchObject({ ok: false, failure: { code: "authentication_required" } }); expect(fixture.records).toEqual([]);
  });
  it("should reject an epoch change after the provider read before persisting its observation", async () => {
    const fixture = prepareReconciliation();
    fixture.lookup.read = async () => { fixture.resolver.execute = async () => ({ allowed: true, context: { ...fixture.context, securityEpoch: "changed-synthetic-epoch" } }); return { outcome: "delivered", providerMessageId: fixture.reference.providerMessageId }; };
    expect(await fixture.cases.execute(fixture.query, new AbortController().signal)).toMatchObject({ ok: false, failure: { code: "permission_denied" } }); expect(fixture.records).toEqual([]);
  });
  it("should preserve classified provider read failure without inventing a stored receipt", async () => {
    const fixture = prepareReconciliation(), cause = new MessagingConnectionInspectionError("dependency_unavailable", { cause: new Error("Synthetic transport unavailable") }); fixture.lookup.read = async () => { throw cause; };
    expect(await fixture.cases.execute(fixture.query, new AbortController().signal)).toEqual({ ok: false, failure: { code: "dependency_unavailable", cause } }); expect(fixture.records).toEqual([]);
  });
  it("should retain indeterminate commit identity without claiming a confirmed transport write", async () => {
    const fixture = prepareReconciliation(), cause = new MessagingDeliveryStorageError("operation_unresolved", { operation: "complete_attempt", deliveryId: fixture.reference.deliveryId, attemptId: fixture.reference.attemptId, cause: new Error("Synthetic commit response lost") }); fixture.repository.record = async () => { throw cause; };
    expect(await fixture.cases.execute(fixture.query, new AbortController().signal)).toEqual({ ok: false, failure: { code: "operation_unresolved", cause } }); expect(fixture.records).toEqual([]);
  });
  it("should preserve cancellation before the read and after an in-flight read without a write", async () => {
    const fixture = prepareReconciliation(), controller = new AbortController(), reason = new Error("Synthetic original lookup cancelled"); controller.abort(reason);
    await expect(fixture.cases.execute(fixture.query, controller.signal)).rejects.toBe(reason); expect(fixture.reads).toBe(0);
    const after = new AbortController(); fixture.lookup.read = async () => { after.abort(reason); return { outcome: "delivered", providerMessageId: fixture.reference.providerMessageId }; };
    await expect(fixture.cases.execute(fixture.query, after.signal)).rejects.toBe(reason); expect(fixture.records).toEqual([]);
  });
});

describe("monotonic original transport evidence", () => {
  const states: MessageDeliveryAttempt["state"][] = ["in_flight", "unknown", "accepted", "delivered", "rejected"];
  const outcomes: MessageStatusObservation["outcome"][] = ["unknown", "accepted", "delivered", "rejected"];
  const expectedStates: Record<MessageDeliveryAttempt["state"], Record<MessageStatusObservation["outcome"], MessageDeliveryAttempt["state"]>> = {
    in_flight: { unknown: "unknown", accepted: "accepted", delivered: "delivered", rejected: "rejected" },
    unknown: { unknown: "unknown", accepted: "accepted", delivered: "delivered", rejected: "rejected" },
    accepted: { unknown: "accepted", accepted: "accepted", delivered: "delivered", rejected: "rejected" },
    delivered: { unknown: "delivered", accepted: "delivered", delivered: "delivered", rejected: "delivered" },
    rejected: { unknown: "rejected", accepted: "rejected", delivered: "rejected", rejected: "rejected" },
  };
  it.each(states.flatMap((state) => outcomes.map((outcome) => ({ state, outcome }))))("should preserve terminal facts when reconciling $state with $outcome", ({ state, outcome }) => {
    expect(reconcileMessageAttemptState(state, outcome)).toBe(expectedStates[state][outcome]);
  });
});
