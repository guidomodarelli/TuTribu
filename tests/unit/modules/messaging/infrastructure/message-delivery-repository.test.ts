/** @vitest-environment node */
/** Exercises real fair claims, markers, receipts and rollback without a sender or platform SDK mock. @module message-delivery-repository-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationIssuer, advanceVerificationRequestCooldown } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresMessageDeliveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-repository";
import { DispatchMessageDeliveriesUseCase } from "@/src/modules/messaging/application/use-cases/dispatch-message-deliveries-use-case";
import { createMessagingDispatchConfig } from "@/src/modules/messaging/infrastructure/config/messaging-dispatch-config";
import type { MessagingDispatchDiagnostic } from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import type { MessageDeliveryReceipt } from "@/src/modules/messaging/domain/repositories/message-delivery-repository";
import { TRIBE_LIFECYCLE_AUDIT_MIGRATIONS } from "@/tests/support/constants/tribe-lifecycle-audit";

/**
 * Issues a real own challenge and applies only versioned outbox artifacts to an owned branch.
 * @param database - Disposable branch with verified ownership.
 * @param phone - Whether to seed a phone/country scenario instead of the email channel.
 * @returns Real repository, current resource and its confirmed delivery.
 */
async function prepareOutbox(database: AcademyAdmissionTestDatabase, phone = false) {
  const fixture = await prepareContactVerificationIssuer(database, "admission", phone);
  await database.applyMigration("20261005092500_guard_messaging_attempts.sql");
  await database.applyMigration("20261006140000_claim_messaging_deliveries_fairly.sql");
  await database.applyMigration("20261006160000_purge_verification_delivery_material.sql");
  await database.applyMigration("20261014035258_audit_messaging_delivery_transitions.sql");
  if (phone) await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.scope.tribeId}`));
  const issued = await fixture.issue();
  if (issued.state !== "completed" || issued.result.outcome !== "issued") throw new Error("Synthetic outbox issue did not complete");
  const repository = new PostgresMessageDeliveryRepository((actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run), async () => true, async () => fixture.config);
  return { ...fixture, original: issued.result, repository };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("message delivery repository", () => {
  it.each(["accepted", "delivered"] as const)("should preserve a charged attempt through physical retirement and record its late %s receipt privately once", async (outcome) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOutbox(database);
      await database.applyMigration("20261005093000_guard_academy_membership_sources.sql");
      await database.applyMigration("20261006220000_extend_admission_notifications.sql");
      for (const migration of TRIBE_LIFECYCLE_AUDIT_MIGRATIONS) await database.applyMigration(migration);
      const claim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 }))[0];
      const authorization = await fixture.repository.authorize(claim, randomUUID());
      if (authorization.outcome !== "authorized") throw new Error("Retired delivery audit fixture failed: committed_attempt_unavailable");
      const providerMessageId = randomUUID();
      if (outcome === "delivered") expect(await fixture.repository.complete({ context: authorization.context, outcome: "accepted", providerMessageId, correlationId: null, reason: "provider_accepted" })).toMatchObject({ outcome: "completed" });
      const before = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ state: "queued" | "accepted"; version: number; delivery_hash: string; attempt_hash: string; reservation_hash: string }>(sql`select delivery.state,delivery.version,md5(to_jsonb(delivery)::text) as delivery_hash,(select md5(to_jsonb(attempt)::text) from public.message_delivery_attempts attempt where attempt.id=${authorization.context.attemptId}) as attempt_hash,(select md5(to_jsonb(reservation)::text) from public.messaging_usage_reservations reservation where reservation.delivery_id=delivery.id) as reservation_hash from public.message_deliveries delivery where delivery.id=${fixture.original.deliveryId}`)).rows[0]);
      const priorReceipt = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select operation_id,resource_version,cause,metadata,created_at from public.academy_admission_audit_events where resource_id=${fixture.original.deliveryId} and event_type='delivery_accepted'`)).rows);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.tribes where id=${fixture.scope.tribeId}`));
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select delivery.state,delivery.version,md5(to_jsonb(delivery)::text) as delivery_hash,(select md5(to_jsonb(attempt)::text) from public.message_delivery_attempts attempt where attempt.id=${authorization.context.attemptId}) as attempt_hash,(select md5(to_jsonb(reservation)::text) from public.messaging_usage_reservations reservation where reservation.delivery_id=delivery.id) as reservation_hash from public.message_deliveries delivery where delivery.id=${fixture.original.deliveryId}`)).rows).toEqual([before]);
        expect((await transaction.execute(sql`select operation_id,resource_version,cause,metadata,created_at from public.academy_admission_retired_audit_events where resource_id=${fixture.original.deliveryId} and event_type='delivery_accepted'`)).rows).toEqual(priorReceipt);
        expect((await transaction.execute(sql`select count(*)::integer as total from public.academy_admission_retired_audit_events where resource_id=${fixture.original.deliveryId} and event_type='delivery_cancelled'`)).rows).toEqual([{ total: 0 }]);
      });
      const receipt: MessageDeliveryReceipt = { context: authorization.context, outcome, providerMessageId, correlationId: null, reason: outcome === "accepted" ? "provider_accepted" : "provider_delivered" };
      expect(await fixture.repository.complete(receipt)).toMatchObject({ outcome: "completed" });
      expect(await fixture.repository.complete(receipt)).toMatchObject({ outcome: "unchanged" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select audit.event_type,audit.cause,audit.resource_version,audit.metadata,audit.tribe_lifecycle_operation_id,audit.operation_id=delivery.idempotency_key as original_ledger,audit.actor_reference_id=operation.actor_reference_id as original_actor,audit.created_at=attempt.completed_at as owner_clock from public.academy_admission_retired_audit_events audit join public.message_deliveries delivery on delivery.id=audit.resource_id and delivery.tribe_id=audit.tribe_id join public.message_delivery_attempts attempt on attempt.id=${authorization.context.attemptId} join public.academy_admission_retired_operations operation on operation.id=audit.operation_id and operation.tribe_id=audit.tribe_id where audit.resource_id=${fixture.original.deliveryId} and audit.event_type=${outcome === "accepted" ? "delivery_accepted" : "delivery_delivered"}`)).rows).toEqual([{ event_type: outcome === "accepted" ? "delivery_accepted" : "delivery_delivered", cause: receipt.reason, resource_version: before.version + 1, tribe_lifecycle_operation_id: null, original_ledger: true, original_actor: true, owner_clock: true, metadata: { fromState: before.state, toState: outcome, previousVersion: before.version, connectionId: fixture.scope.connectionId, connectionVersion: 1, channel: "email", attemptId: authorization.context.attemptId, authorizedUsagePolicyVersion: authorization.context.authorizedUsagePolicyVersion } }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "consumed" }]);
      });
    });
  }, 240_000);

  it("should keep a possibly committed authorization unresolved with no RPC and reconcile the same charged marker after response loss", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOutbox(database);
      let transactions = 0, preparations = 0, sends = 0;
      const diagnostics: MessagingDispatchDiagnostic[] = [];
      const repository = new PostgresMessageDeliveryRepository(async (actorUserId, run) => {
        const result = await database.withContext({ userId: actorUserId, email: null }, run);
        transactions += 1;
        if (transactions === 2) throw new Error("Synthetic marker commit response lost");
        return result;
      }, async () => true, async () => fixture.config);
      const dispatcher = new DispatchMessageDeliveriesUseCase(repository, { async prepare() { preparations += 1; return { async send() { sends += 1; return { outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" }; } }; } }, createMessagingDispatchConfig(), { now: Date.now, createId: randomUUID, defer: (work) => { void work; }, report: (diagnostic) => { diagnostics.push(diagnostic); } });
      expect(await dispatcher.execute()).toMatchObject({ claimed: 1, authorized: 0, unresolved: 1, accepted: 0 });
      expect(sends).toBe(0);
      expect(preparations).toBe(0);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({ stage: "authorize", deliveryId: fixture.original.deliveryId, cause: { code: "operation_unresolved" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state from public.message_delivery_attempts where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "in_flight" }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "consumed" }]);
        await transaction.execute(sql`update public.message_deliveries set lease_until=clock_timestamp()-interval '1 second',version=version+1 where id=${fixture.original.deliveryId}`);
      });
      expect(await fixture.repository.reconcileExpiredLeases(2)).toBe(1);
      expect(await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 })).toEqual([]);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "unknown" }]);
        expect((await transaction.execute(sql`select state from public.message_delivery_attempts where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "unknown" }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "consumed" }]);
      });
    });
  }, 240_000);

  it("should commit a single marker/reservation, record accepted and delivered separately and retain quota for late evidence", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOutbox(database);
      const claims = await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 });
      expect(claims).toHaveLength(1);
      const authorization = await fixture.repository.authorize(claims[0], randomUUID());
      if (authorization.outcome !== "authorized") throw new Error("Synthetic marker did not commit");
      const context = authorization.context;
      expect(await fixture.repository.authorize(claims[0], randomUUID())).toMatchObject({ outcome: "stale" });
      expect(await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 })).toEqual([]);
      expect(await fixture.repository.readAttempt(context)).toMatchObject({ id: context.attemptId, state: "in_flight", version: 1 });
      const providerId = randomUUID();
      expect(await fixture.repository.complete({ context, outcome: "accepted", providerMessageId: providerId, correlationId: null, reason: "provider_accepted" })).toMatchObject({ outcome: "completed", attemptVersion: 2 });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select event.created_at=attempt.completed_at as owner_clock from public.academy_admission_audit_events event join public.message_delivery_attempts attempt on attempt.id=${context.attemptId} where event.resource_id=${fixture.original.deliveryId} and event.event_type='delivery_accepted'`)).rows).toEqual([{ owner_clock: true }]);
      });
      expect(await fixture.repository.complete({ context, outcome: "accepted", providerMessageId: providerId, correlationId: null, reason: "provider_accepted" })).toMatchObject({ outcome: "unchanged", attemptVersion: 2 });
      expect(await fixture.repository.complete({ context, outcome: "delivered", providerMessageId: providerId, correlationId: null, reason: "provider_delivered" })).toMatchObject({ outcome: "completed", attemptVersion: 3 });
      expect(await fixture.repository.complete({ context, outcome: "delivered", providerMessageId: providerId, correlationId: null, reason: "provider_delivered" })).toMatchObject({ outcome: "unchanged", attemptVersion: 3 });
      expect(await fixture.repository.complete({ context, outcome: "unknown", providerMessageId: null, correlationId: null, reason: "dispatch_result_unknown" })).toMatchObject({ outcome: "stale" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "delivered" }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where attempt_id=${context.attemptId}`)).rows).toEqual([{ state: "consumed" }]);
        expect((await transaction.execute(sql`select state from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows).toEqual([{ state: "issued" }]);
        expect((await transaction.execute(sql`select id from public.academy_admission_verification_proofs where challenge_id=${fixture.original.challengeId}`)).rows).toEqual([]);
        const events = (await transaction.execute(sql`select event.event_type,event.actor_user_id,event.operation_id=delivery.idempotency_key as original_ledger,event.resource_version,event.rule,event.cause,event.metadata from public.academy_admission_audit_events event join public.message_deliveries delivery on delivery.id=event.resource_id and delivery.tribe_id=event.tribe_id where event.resource_type='message_delivery' and event.resource_id=${fixture.original.deliveryId} order by event.created_at,event.id`)).rows;
        expect(events).toEqual([
          { event_type: "delivery_created", actor_user_id: fixture.userId, original_ledger: true, resource_version: 1, rule: "issue_contact_challenge", cause: null, metadata: { fromState: null, toState: "queued", previousVersion: null, connectionId: fixture.scope.connectionId, connectionVersion: fixture.scope.connectionVersion, channel: "email", attemptId: null, authorizedUsagePolicyVersion: null } },
          { event_type: "delivery_attempt_started", actor_user_id: fixture.userId, original_ledger: true, resource_version: 3, rule: "authorize_delivery", cause: null, metadata: { fromState: "queued", toState: "queued", previousVersion: 2, connectionId: fixture.scope.connectionId, connectionVersion: fixture.scope.connectionVersion, channel: "email", attemptId: context.attemptId, authorizedUsagePolicyVersion: context.authorizedUsagePolicyVersion } },
          { event_type: "delivery_accepted", actor_user_id: fixture.userId, original_ledger: true, resource_version: 4, rule: "complete_attempt", cause: "provider_accepted", metadata: { fromState: "queued", toState: "accepted", previousVersion: 3, connectionId: fixture.scope.connectionId, connectionVersion: fixture.scope.connectionVersion, channel: "email", attemptId: context.attemptId, authorizedUsagePolicyVersion: context.authorizedUsagePolicyVersion } },
          { event_type: "delivery_delivered", actor_user_id: fixture.userId, original_ledger: true, resource_version: 5, rule: "complete_attempt", cause: "provider_delivered", metadata: { fromState: "accepted", toState: "delivered", previousVersion: 4, connectionId: fixture.scope.connectionId, connectionVersion: fixture.scope.connectionVersion, channel: "email", attemptId: context.attemptId, authorizedUsagePolicyVersion: context.authorizedUsagePolicyVersion } },
        ]);
      });
      await advanceVerificationRequestCooldown(database, fixture);
      expect(await fixture.issue(fixture.original.challengeId)).toMatchObject({ state: "completed", result: { outcome: "issued" } });
      const rejectedClaim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 }))[0];
      const rejected = await fixture.repository.authorize(rejectedClaim, randomUUID());
      if (rejected.outcome !== "authorized") throw new Error("Synthetic rejected marker did not commit");
      const rejection = { context: rejected.context, outcome: "rejected" as const, providerMessageId: null, correlationId: null, reason: "provider_rejected" as const };
      expect(await fixture.repository.complete(rejection)).toMatchObject({ outcome: "completed", attemptVersion: 2 });
      expect(await fixture.repository.complete(rejection)).toMatchObject({ outcome: "unchanged", attemptVersion: 2 });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select event_type,cause from public.academy_admission_audit_events where resource_type='message_delivery' and resource_id=${rejected.context.deliveryId} order by created_at,id`)).rows).toEqual([{ event_type: "delivery_created", cause: null }, { event_type: "delivery_attempt_started", cause: null }, { event_type: "delivery_failed", cause: "provider_rejected" }]);
      });
    });
  }, 240_000);

  it.each(["suppressed", "quota_exceeded"] as const)("should roll back %s when maintenance authority is revoked during its SQL mutation", async (outcome) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOutbox(database, true);
      const claim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 }))[0];
      await database.withContext(fixture.own, (transaction) => outcome === "suppressed"
        ? transaction.execute(sql`update public.messaging_usage_policies set allowed_countries='{}',version=version+1 where tribe_id=${fixture.scope.tribeId}`)
        : transaction.execute(sql`update public.messaging_usage_policies set verification_daily_limit=0,version=version+1 where tribe_id=${fixture.scope.tribeId}`));
      const repository = new PostgresMessageDeliveryRepository((actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run), async (transaction) => {
        // The own authority reader observes the actual attempted mutation in its same guarded transaction.
        const current = (await transaction.execute<{ last_outcome: string | null }>(sql`select last_outcome from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows[0];
        return current.last_outcome !== "recipient_not_allowed" && current.last_outcome !== "quota_exceeded";
      }, async () => fixture.config);
      await expect(repository.authorize(claim, randomUUID())).rejects.toMatchObject({ code: "permission_denied" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state,version,last_outcome from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "queued", version: claim.version, last_outcome: null }]);
        expect((await transaction.execute(sql`select id from public.message_delivery_attempts where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.messaging_usage_reservations where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select event_type from public.academy_admission_audit_events where resource_type='message_delivery' and resource_id=${fixture.original.deliveryId}`)).rows).toEqual([{ event_type: "delivery_created" }]);
      });
    });
  }, 240_000);

  it("should suppress a withdrawn country before marker with no reservation and preserve the original request event", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOutbox(database, true);
      const claim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 }))[0];
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_usage_policies set allowed_countries='{}',version=version+1 where tribe_id=${fixture.scope.tribeId}`));
      expect(await fixture.repository.authorize(claim, randomUUID())).toMatchObject({ outcome: "suppressed" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state,last_outcome from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "suppressed", last_outcome: "recipient_not_allowed" }]);
        expect((await transaction.execute(sql`select id from public.message_delivery_attempts where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.messaging_usage_reservations where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select event_type from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([{ event_type: "code_request" }]);
        expect((await transaction.execute(sql`select event.event_type,event.actor_user_id,event.operation_id=delivery.idempotency_key as original_ledger,event.resource_version,event.cause,event.metadata from public.academy_admission_audit_events event join public.message_deliveries delivery on delivery.id=event.resource_id and delivery.tribe_id=event.tribe_id where event.resource_type='message_delivery' and event.resource_id=${fixture.original.deliveryId} order by event.created_at,event.id`)).rows).toEqual([
          { event_type: "delivery_created", actor_user_id: fixture.userId, original_ledger: true, resource_version: 1, cause: null, metadata: { fromState: null, toState: "queued", previousVersion: null, connectionId: fixture.scope.connectionId, connectionVersion: fixture.scope.connectionVersion, channel: fixture.scope.channel, attemptId: null, authorizedUsagePolicyVersion: null } },
          { event_type: "delivery_suppressed", actor_user_id: fixture.userId, original_ledger: true, resource_version: claim.version+1, cause: "recipient_not_allowed", metadata: { fromState: "queued", toState: "suppressed", previousVersion: claim.version, connectionId: fixture.scope.connectionId, connectionVersion: fixture.scope.connectionVersion, channel: fixture.scope.channel, attemptId: null, authorizedUsagePolicyVersion: null } },
        ]);
      });
    });
  }, 240_000);

  it("should turn an expired marked lease unknown without reclaiming it and accept a late receipt for that same charged attempt", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOutbox(database);
      const claim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 }))[0];
      const authorization = await fixture.repository.authorize(claim, randomUUID());
      if (authorization.outcome !== "authorized") throw new Error("Synthetic marker did not commit");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.message_deliveries set lease_until=clock_timestamp()-interval '1 second',version=version+1 where id=${fixture.original.deliveryId}`));
      expect(await fixture.repository.reconcileExpiredLeases(100)).toBe(1);
      expect(await fixture.repository.readAttempt(authorization.context)).toMatchObject({ state: "unknown", version: 2 });
      expect(await fixture.repository.reconcileExpiredLeases(100)).toBe(0);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select event.actor_user_id,event.operation_id=delivery.idempotency_key as original_ledger,event.resource_version,event.cause,event.created_at=attempt.completed_at as owner_clock,event.metadata from public.academy_admission_audit_events event join public.message_deliveries delivery on delivery.id=event.resource_id and delivery.tribe_id=event.tribe_id join public.message_delivery_attempts attempt on attempt.id=${authorization.context.attemptId} where event.resource_type='message_delivery' and event.resource_id=${fixture.original.deliveryId} and event.event_type='delivery_reconciled'`)).rows).toEqual([{ actor_user_id: null, original_ledger: true, resource_version: 5, cause: "worker_lease_expired", owner_clock: true, metadata: { fromState: "queued", toState: "unknown", previousVersion: 4, connectionId: fixture.scope.connectionId, connectionVersion: fixture.scope.connectionVersion, channel: "email", attemptId: authorization.context.attemptId, authorizedUsagePolicyVersion: authorization.context.authorizedUsagePolicyVersion } }]);
      });
      expect(await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 })).toEqual([]);
      expect(await fixture.repository.complete({ context: authorization.context, outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" })).toMatchObject({ outcome: "completed", attemptVersion: 3 });
      await database.withContext(fixture.own, async (transaction) => expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where attempt_id=${authorization.context.attemptId}`)).rows).toEqual([{ state: "consumed" }]));
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select event_type from public.academy_admission_audit_events where resource_type='message_delivery' and resource_id=${fixture.original.deliveryId} order by created_at,id`)).rows).toEqual([{ event_type: "delivery_created" }, { event_type: "delivery_attempt_started" }, { event_type: "delivery_reconciled" }, { event_type: "delivery_accepted" }]);
      });
    });
  }, 240_000);

  it("should audit quota deferral once without claiming an attempt or treating evaluated policy as authorized usage", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOutbox(database);
      const claim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 }))[0];
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_usage_policies set verification_daily_limit=0,version=version+1 where tribe_id=${fixture.scope.tribeId}`));
      expect(await fixture.repository.authorize(claim, randomUUID())).toMatchObject({ outcome: "quota_exceeded", deliveryVersion: claim.version+1 });
      expect(await fixture.repository.authorize(claim, randomUUID())).toMatchObject({ outcome: "stale" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select event.event_type,event.operation_id=delivery.idempotency_key as original_ledger,event.resource_version,event.cause,event.metadata from public.academy_admission_audit_events event join public.message_deliveries delivery on delivery.id=event.resource_id and delivery.tribe_id=event.tribe_id where event.resource_type='message_delivery' and event.resource_id=${fixture.original.deliveryId} order by event.created_at,event.id`)).rows).toEqual([
          { event_type: "delivery_created", original_ledger: true, resource_version: 1, cause: null, metadata: { fromState: null, toState: "queued", previousVersion: null, connectionId: fixture.scope.connectionId, connectionVersion: fixture.scope.connectionVersion, channel: "email", attemptId: null, authorizedUsagePolicyVersion: null } },
          { event_type: "delivery_deferred", original_ledger: true, resource_version: claim.version+1, cause: "quota_exceeded", metadata: { fromState: "queued", toState: "queued", previousVersion: claim.version, connectionId: fixture.scope.connectionId, connectionVersion: fixture.scope.connectionVersion, channel: "email", attemptId: null, authorizedUsagePolicyVersion: null } },
        ]);
        expect((await transaction.execute(sql`select id from public.message_delivery_attempts where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.messaging_usage_reservations where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select state,last_outcome from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "queued", last_outcome: "quota_exceeded" }]);
      });
    });
  }, 240_000);

  it("should suppress an originally expired unmarked lease once without inventing an actor, ledger or reservation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOutbox(database), deliveryId = randomUUID();
      const original = await database.withContext(fixture.own, async (transaction) => {
        const createdAt = new Date((await transaction.execute<{ instant: string | Date }>(sql`select clock_timestamp()-interval '20 minutes' as instant`)).rows[0].instant);
        return (await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at,lease_token,lease_until) values (${deliveryId},${fixture.scope.tribeId},${fixture.scope.connectionId},${fixture.scope.connectionVersion},${fixture.config.environment},${fixture.config.securityEpoch},'admission_notification',${randomUUID()},${randomUUID()},'email',${randomUUID()},${randomBytes(32)},'synthetic-expired-notification','{}',1,${createdAt},${createdAt},${new Date(createdAt.getTime()+600_000)},${randomUUID()},${new Date(createdAt.getTime()+60_000)}) returning created_at,deadline_at`)).rows[0];
      });
      expect(await fixture.repository.reconcileExpiredLeases(2)).toBe(1);
      expect(await fixture.repository.reconcileExpiredLeases(2)).toBe(0);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select event_type,actor_user_id,operation_id,resource_version,cause,metadata from public.academy_admission_audit_events where resource_type='message_delivery' and resource_id=${deliveryId}`)).rows).toEqual([{ event_type: "delivery_suppressed", actor_user_id: null, operation_id: null, resource_version: 2, cause: "delivery_expired", metadata: { fromState: "queued", toState: "suppressed", previousVersion: 1, connectionId: fixture.scope.connectionId, connectionVersion: fixture.scope.connectionVersion, channel: "email", attemptId: null, authorizedUsagePolicyVersion: null } }]);
        expect((await transaction.execute(sql`select state,created_at,deadline_at from public.message_deliveries where id=${deliveryId}`)).rows).toEqual([{ state: "suppressed", ...original }]);
        expect((await transaction.execute(sql`select id from public.message_delivery_attempts where delivery_id=${deliveryId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.messaging_usage_reservations where delivery_id=${deliveryId}`)).rows).toEqual([]);
      });
    });
  }, 240_000);

  it("should keep an unclassified private receipt reason out of the audit while retaining its exact outcome and completion clock", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOutbox(database);
      const claim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 }))[0];
      const authorization = await fixture.repository.authorize(claim, randomUUID());
      if (authorization.outcome !== "authorized") throw new Error("Synthetic private receipt marker did not commit");
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select outcome from public.complete_messaging_delivery_attempt(${authorization.context.attemptId},${authorization.context.leaseToken},1,'unknown',NULL,NULL,'synthetic-private-provider-detail')`)).rows).toEqual([{ outcome: "completed" }]);
        const events = (await transaction.execute(sql`select event.event_type,event.cause,event.metadata,event.created_at=attempt.completed_at as owner_clock from public.academy_admission_audit_events event join public.message_delivery_attempts attempt on attempt.id=${authorization.context.attemptId} where event.resource_type='message_delivery' and event.resource_id=${fixture.original.deliveryId} and event.event_type='delivery_unknown'`)).rows;
        expect(events).toEqual([{ event_type: "delivery_unknown", cause: null, owner_clock: true, metadata: { fromState: "queued", toState: "unknown", previousVersion: 3, connectionId: fixture.scope.connectionId, connectionVersion: fixture.scope.connectionVersion, channel: "email", attemptId: authorization.context.attemptId, authorizedUsagePolicyVersion: authorization.context.authorizedUsagePolicyVersion } }]);
        expect(JSON.stringify(events)).not.toContain("synthetic-private-provider-detail");
      });
    });
  }, 240_000);

  it("should roll back a receipt and its audit together when post-write maintenance authority is revoked", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOutbox(database);
      const claim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 }))[0];
      const authorization = await fixture.repository.authorize(claim, randomUUID());
      if (authorization.outcome !== "authorized") throw new Error("Synthetic rollback marker did not commit");
      const repository = new PostgresMessageDeliveryRepository((actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run), async (transaction) => {
        const delivery = (await transaction.execute<{ state: string }>(sql`select state from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows[0];
        return delivery.state !== "accepted";
      }, async () => fixture.config);
      await expect(repository.complete({ context: authorization.context, outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" })).rejects.toMatchObject({ code: "permission_denied" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state,version from public.message_delivery_attempts where id=${authorization.context.attemptId}`)).rows).toEqual([{ state: "in_flight", version: 1 }]);
        expect((await transaction.execute(sql`select state,version from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "queued", version: 3 }]);
        expect((await transaction.execute(sql`select event_type from public.academy_admission_audit_events where resource_type='message_delivery' and resource_id=${fixture.original.deliveryId} order by created_at,id`)).rows).toEqual([{ event_type: "delivery_created" }, { event_type: "delivery_attempt_started" }]);
      });
    });
  }, 240_000);

  it("should claim one head per tribe despite an older saturated tribe and never duplicate a live lease across concurrent callers", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOutbox(database);
      await database.withContext(fixture.own, async (transaction) => {
        const oldest = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp()-interval '10 minutes' as now`)).rows[0].now);
        for (const tribeIndex of [0,1,2]) {
          const tribeId = randomUUID(), connectionId = randomUUID();
          await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic fair tribe',${`fair-${tribeId}`},${fixture.userId})`);
          await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,environment,security_epoch,candidate_version) values (${connectionId},${tribeId},${fixture.userId},${fixture.config.environment},${fixture.config.securityEpoch},1)`);
          await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch) values (${connectionId},${tribeId},1,${fixture.config.environment},${fixture.config.securityEpoch})`);
          const count = tribeIndex === 0 ? 12 : 1;
          for (let deliveryIndex = 0; deliveryIndex < count; deliveryIndex += 1) await transaction.execute(sql`insert into public.message_deliveries(tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) values (${tribeId},${connectionId},1,${fixture.config.environment},${fixture.config.securityEpoch},'admission_notification',${randomUUID()},${randomUUID()},'email',${randomUUID()},${randomBytes(32)},'synthetic-payload','{}',1,${oldest},${tribeIndex === 0 ? oldest : new Date(oldest.getTime()+60_000)},${new Date(oldest.getTime()+86_400_000)})`);
        }
      });
      const first = await fixture.repository.claim({ leaseToken: randomUUID(), limit: 3, leaseSeconds: 90 });
      expect(first).toHaveLength(3);
      expect(new Set(first.map((claim) => claim.tribeId)).size).toBe(3);
      const remaining = await Promise.all([fixture.repository.claim({ leaseToken: randomUUID(), limit: 3, leaseSeconds: 90 }), fixture.repository.claim({ leaseToken: randomUUID(), limit: 3, leaseSeconds: 90 })]);
      const ids = [...first,...remaining.flat()].map((claim) => claim.deliveryId);
      expect(new Set(ids).size).toBe(ids.length);
    });
  }, 240_000);

  it("should deny platform authority and roll back an authorized marker if recovery changes before commit", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareOutbox(database);
      const denied = new PostgresMessageDeliveryRepository((actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run), async () => false, async () => fixture.config);
      await expect(denied.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 })).rejects.toMatchObject({ code: "permission_denied" });
      const claim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 }))[0];
      let reads = 0;
      const recovery = new PostgresMessageDeliveryRepository((actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run), async () => true, async () => { reads += 1; return { ...fixture.config, recoveryLocked: reads > 1 }; });
      await expect(recovery.authorize(claim, randomUUID())).rejects.toMatchObject({ code: "connection_incomplete" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id from public.message_delivery_attempts where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.messaging_usage_reservations where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select state,version from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "queued", version: claim.version }]);
      });
    });
  }, 240_000);
});
