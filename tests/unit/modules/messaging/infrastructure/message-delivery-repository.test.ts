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
  if (phone) await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.scope.tribeId}`));
  const issued = await fixture.issue();
  if (issued.state !== "completed" || issued.result.outcome !== "issued") throw new Error("Synthetic outbox issue did not complete");
  const repository = new PostgresMessageDeliveryRepository((actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run), async () => true, async () => fixture.config);
  return { ...fixture, original: issued.result, repository };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("message delivery repository", () => {
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
      expect(await fixture.repository.complete({ context, outcome: "accepted", providerMessageId: providerId, correlationId: null, reason: "provider_accepted" })).toMatchObject({ outcome: "unchanged", attemptVersion: 2 });
      expect(await fixture.repository.complete({ context, outcome: "delivered", providerMessageId: providerId, correlationId: null, reason: "provider_delivered" })).toMatchObject({ outcome: "completed", attemptVersion: 3 });
      expect(await fixture.repository.complete({ context, outcome: "delivered", providerMessageId: providerId, correlationId: null, reason: "provider_delivered" })).toMatchObject({ outcome: "unchanged", attemptVersion: 3 });
      expect(await fixture.repository.complete({ context, outcome: "unknown", providerMessageId: null, correlationId: null, reason: "dispatch_result_unknown" })).toMatchObject({ outcome: "stale" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "delivered" }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where attempt_id=${context.attemptId}`)).rows).toEqual([{ state: "consumed" }]);
        expect((await transaction.execute(sql`select state from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows).toEqual([{ state: "issued" }]);
        expect((await transaction.execute(sql`select id from public.academy_admission_verification_proofs where challenge_id=${fixture.original.challengeId}`)).rows).toEqual([]);
      });
      await advanceVerificationRequestCooldown(database, fixture);
      expect(await fixture.issue(fixture.original.challengeId)).toMatchObject({ state: "completed", result: { outcome: "issued" } });
      const rejectedClaim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 }))[0];
      const rejected = await fixture.repository.authorize(rejectedClaim, randomUUID());
      if (rejected.outcome !== "authorized") throw new Error("Synthetic rejected marker did not commit");
      const rejection = { context: rejected.context, outcome: "rejected" as const, providerMessageId: null, correlationId: null, reason: "provider_rejected" as const };
      expect(await fixture.repository.complete(rejection)).toMatchObject({ outcome: "completed", attemptVersion: 2 });
      expect(await fixture.repository.complete(rejection)).toMatchObject({ outcome: "unchanged", attemptVersion: 2 });
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
      expect(await fixture.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 })).toEqual([]);
      expect(await fixture.repository.complete({ context: authorization.context, outcome: "accepted", providerMessageId: randomUUID(), correlationId: null, reason: "provider_accepted" })).toMatchObject({ outcome: "completed", attemptVersion: 3 });
      await database.withContext(fixture.own, async (transaction) => expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where attempt_id=${authorization.context.attemptId}`)).rows).toEqual([{ state: "consumed" }]));
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
