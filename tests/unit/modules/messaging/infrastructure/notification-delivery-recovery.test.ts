/** @vitest-environment node */
/** Exercises real original-notification recovery, lineage, usage preservation and safe denials. @module notification-delivery-recovery-sql-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareNotificationDeliveryRecovery } from "@/tests/support/notification-delivery-recovery-fixture";
import { createNotificationRecoveryPayloadMac } from "@/src/modules/messaging/infrastructure/encryption/notification-recovery-payload-mac";
import { PostgresNotificationDeliveryRecoveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-notification-delivery-recovery-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { NotificationDeliveryRecoveryContext } from "@/src/modules/messaging/domain/repositories/notification-delivery-recovery";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";

/** @param fixture - Actual prepared native fixture. @returns A controlled own security-reader wait entered only after SQL child and audit are staged, plus a single drained recovery outcome. */
function prepareFinalWait(fixture: Awaited<ReturnType<typeof prepareNotificationDeliveryRecovery>>) {
  let active: RequestDatabase | null = null;
  let markEntered!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => { markEntered = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  let waited = false, epoch = fixture.creation.fixture.config.securityEpoch;
  let stagedTiming: { deadline_remaining_ms: number; lease_remaining_ms: number } | null = null;
  let waitForOriginalDeadline!: () => Promise<void>;
  const execute = <Result>(context: NotificationDeliveryRecoveryContext, run: (transaction: RequestDatabase) => Promise<Result>) => fixture.execute(context, async (transaction) => {
    active = transaction;
    try { return await run(transaction); }
    finally { active = null; }
  });
  const repository = new PostgresNotificationDeliveryRecoveryRepository(execute, async () => {
    if (active && !waited) {
      const staged = (await active.execute<{ count: number }>(sql`select count(*)::int as count from public.message_deliveries where recovery_of_delivery_id=${fixture.context.deliveryId}`)).rows[0].count;
      if (staged > 0) {
        stagedTiming = (await active.execute<{ deadline_remaining_ms: number; lease_remaining_ms: number }>(sql`select floor(extract(epoch from (delivery.deadline_at-clock_timestamp()))*1000)::int as deadline_remaining_ms,floor(extract(epoch from (operation.lease_until-clock_timestamp()))*1000)::int as lease_remaining_ms from public.message_deliveries delivery join public.academy_admission_operations operation on operation.id=delivery.recovery_operation_id where delivery.recovery_of_delivery_id=${fixture.context.deliveryId}`)).rows[0];
        const stagedDatabase = active;
        waitForOriginalDeadline = async () => {
          let expired = false;
          while (!expired) {
            expired = (await stagedDatabase.execute<{ expired: boolean }>(sql`select clock_timestamp()>=deadline_at as expired from public.message_deliveries where id=${fixture.context.deliveryId}`)).rows[0].expired;
            if (!expired) await new Promise<void>((resolve) => setTimeout(resolve, 500));
          }
        };
        waited = true; markEntered(); await released;
      }
    }
    return { ...fixture.creation.fixture.config, securityEpoch: epoch };
  });
  const outcome = repository.recover(fixture.context, fixture.input).then((result) => ({ result, error: null }), (error: unknown) => ({ result: null, error }));
  return { entered, outcome, release, waitForOriginalDeadline: () => waitForOriginalDeadline(), get stagedTiming() { return stagedTiming; }, setEpoch(value: string) { epoch = value; } };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("notification recovery in PostgreSQL", () => {
  it("should commit one explicit child and audit, preserve original identity and return the same result on replay", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotificationDeliveryRecovery(database);
      const before = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select connection_id,connection_version,source_resource_id,recipient_ref,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,deadline_at from public.message_deliveries where id=${fixture.context.deliveryId}`)).rows[0]);
      const outcome = await fixture.recovery.execute({ ...fixture.input, tribeId: fixture.context.tribeId, deliveryId: fixture.context.deliveryId, requestId: fixture.context.requestId });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error(`Expected composed notification recovery: ${outcome.failure.code}`);
      const result = outcome.value;
      expect(result.state).toBe("completed");
      if (result.state !== "completed") throw new Error("Expected original committed notification recovery");
      const replay = await fixture.recovery.execute({ ...fixture.input, tribeId: fixture.context.tribeId, deliveryId: fixture.context.deliveryId, requestId: fixture.context.requestId });
      expect(replay).toEqual({ ok: true, value: { ...result, replayed: true } });
      const after = await database.withContext(fixture.own, async (transaction) => ({
        original: (await transaction.execute(sql`select connection_id,connection_version,source_resource_id,recipient_ref,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,deadline_at from public.message_deliveries where id=${fixture.context.deliveryId}`)).rows[0],
        originalState: (await transaction.execute(sql`select state,version,lease_token,lease_until from public.message_deliveries where id=${fixture.context.deliveryId}`)).rows[0],
        child: (await transaction.execute<{ id: string; connection_id: string; connection_version: number; source_resource_id: string; recipient_ref: string; state: string; recovery_of_delivery_id: string; payload_fingerprint: Uint8Array; payload_mac_key_id: string; frozen_intent: { senderId: string }; created_at: Date | string; deadline_at: Date | string }>(sql`select id,connection_id,connection_version,source_resource_id,recipient_ref,state,recovery_of_delivery_id,payload_fingerprint,payload_mac_key_id,frozen_intent,created_at,deadline_at from public.message_deliveries where recovery_of_delivery_id=${fixture.context.deliveryId}`)).rows,
        audit: (await transaction.execute(sql`select event.resource_id,event.actor_user_id,event.resource_type,event.resource_version,event.rule,event.cause,event.metadata,event.created_at=delivery.created_at as owner_clock,operation.idempotency_key from public.academy_admission_audit_events event join public.message_deliveries delivery on delivery.id=event.resource_id and delivery.tribe_id=event.tribe_id join public.academy_admission_operations operation on operation.id=event.operation_id and operation.tribe_id=event.tribe_id where event.tribe_id=${fixture.context.tribeId} and event.event_type='notification_delivery_recovered'`)).rows,
        effects: (await transaction.execute(sql`select (select count(*)::int from public.messaging_usage_reservations where tribe_id=${fixture.context.tribeId}) as reservations,(select count(*)::int from public.message_delivery_attempts where tribe_id=${fixture.context.tribeId}) as attempts,(select count(*)::int from public.academy_admission_decisions where tribe_id=${fixture.context.tribeId}) as decisions,(select count(*)::int from public.tribe_members where tribe_id=${fixture.context.tribeId}) as members`)).rows[0],
      }));
      expect(after.original).toEqual(before);
      expect(after.originalState).toMatchObject({ state: "cancelled", version: 2, lease_token: null, lease_until: null });
      expect(after.child).toHaveLength(1);
      expect(after.child[0]).toMatchObject({ id: result.result.recoveryDeliveryId, connection_id: fixture.input.targetConnectionId, connection_version: fixture.targetConfigurationVersion, source_resource_id: fixture.obligationId, recipient_ref: fixture.own.userId, state: "queued", recovery_of_delivery_id: fixture.context.deliveryId });
      expect(new Date(after.child[0].deadline_at)).toEqual(new Date(before.deadline_at as Date | string));
      expect(after.audit).toEqual([{ resource_id: result.result.recoveryDeliveryId, actor_user_id: fixture.context.actorUserId, resource_type: "message_delivery", resource_version: 1, rule: "explicit_notification_recovery", cause: "authorized_connection_replacement", owner_clock: true, idempotency_key: fixture.input.operationId, metadata: { fromState: null, toState: "queued", previousVersion: null, connectionId: fixture.input.targetConnectionId, connectionVersion: fixture.targetConfigurationVersion, channel: "email", attemptId: null, authorizedUsagePolicyVersion: null, originalDeliveryId: fixture.context.deliveryId, targetConnectionId: fixture.input.targetConnectionId, originalConnectionId: before.connection_id, originalConnectionVersion: before.connection_version, originalFromState: "suppressed", originalToState: "cancelled", previousOriginalVersion: 1, originalVersion: 2, originalAttemptId: null, originalAuthorizedUsagePolicyVersion: null } }]);
      expect(after.effects).toEqual({ ...fixture.baselineUsage, decisions: 0, members: 1 });
      const child = after.child[0];
      const payloadContext = { tribeId: fixture.context.tribeId, deliveryId: child.id, originalDeliveryId: fixture.context.deliveryId, connectionId: child.connection_id, connectionVersion: child.connection_version, obligationId: child.source_resource_id, recipientRef: child.recipient_ref, senderId: child.frozen_intent.senderId, createdAt: new Date(child.created_at), deadlineAt: new Date(child.deadline_at) };
      const mac = createNotificationRecoveryPayloadMac(fixture.creation.fixture.config);
      expect(await mac.verify(child.payload_mac_key_id, child.payload_fingerprint, payloadContext)).toBe(true);
      expect(await mac.verify(child.payload_mac_key_id, child.payload_fingerprint, { ...payloadContext, originalDeliveryId: randomUUID() })).toBe(false);
      await expect(fixture.repository.recover(fixture.context, { ...fixture.input, operationId: randomUUID() })).rejects.toMatchObject({ code: "request_conflict" });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.message_deliveries set recovery_of_delivery_id=null,recovery_operation_id=null where id=${child.id}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      const originalAudit = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select resource_id,operation_id,resource_version,rule,cause,metadata,created_at from public.academy_admission_audit_events where tribe_id=${fixture.context.tribeId} and event_type='notification_delivery_recovered'`)).rows);
      expect(originalAudit).toHaveLength(1);
      const recoveryOperationId = originalAudit[0].operation_id as string;
      const originalOperation = await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select operation_id,tribe_id from public.messaging_notification_recovery_origins where operation_id=${recoveryOperationId}`)).rows).toEqual([{ operation_id: recoveryOperationId, tribe_id: fixture.context.tribeId }]);
        return (await transaction.execute(sql`select id,tribe_id,actor_reference_id,operation_type,idempotency_key,intent_fingerprint,fingerprint_key_id,state,version,created_at,completed_at from public.academy_admission_operations where id=${recoveryOperationId}`)).rows;
      });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`select operation_id from public.messaging_notification_recovery_origins`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_notification_recovery_origins set operation_id=${randomUUID()} where operation_id=${recoveryOperationId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.messaging_notification_recovery_origins where operation_id=${recoveryOperationId}`))).rejects.toMatchObject({ cause: { code: "23503" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.academy_admission_operations where id=${recoveryOperationId}`))).rejects.toMatchObject({ cause: { code: "23503" } });
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        try { await transaction.execute(sql`delete from public.tribes where id=${fixture.context.tribeId}`); }
        catch (error) {
          const cause = error instanceof Error ? error.cause as { code?: string; schema?: string; table?: string; column?: string; constraint?: string; routine?: string } | undefined : undefined;
          process.stdout.write(JSON.stringify({ phase: "owned_recovery_archive_delete_failure", code: cause?.code, schema: cause?.schema, table: cause?.table, column: cause?.column, constraint: cause?.constraint, routine: cause?.routine }) + "\n");
          throw error;
        }
        expect((await transaction.execute(sql`select resource_id,operation_id,resource_version,rule,cause,metadata,created_at from public.academy_admission_retired_audit_events where tribe_id=${fixture.context.tribeId} and event_type='notification_delivery_recovered'`)).rows).toEqual(originalAudit);
        expect((await transaction.execute(sql`select id,tribe_id,actor_reference_id,operation_type,idempotency_key,intent_fingerprint,fingerprint_key_id,state,version,created_at,completed_at from public.academy_admission_retired_operations where id=${recoveryOperationId}`)).rows).toEqual(originalOperation);
        expect((await transaction.execute(sql`select recovery_operation_id,recovery_of_delivery_id,state,version from public.message_deliveries where id=${child.id}`)).rows).toEqual([{ recovery_operation_id: recoveryOperationId, recovery_of_delivery_id: fixture.context.deliveryId, state: "cancelled", version: 2 }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.messaging_usage_reservations where tribe_id=${fixture.context.tribeId}) as reservations,(select count(*)::int from public.message_delivery_attempts where tribe_id=${fixture.context.tribeId}) as attempts,(select count(*)::int from public.academy_admission_operations where id=${recoveryOperationId}) as live_operations`)).rows).toEqual([{ ...fixture.baselineUsage, live_operations: 0 }]);
      });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,recovery_of_delivery_id,recovery_operation_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) select ${randomUUID()},tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,recovery_of_delivery_id,recovery_operation_id,actor_user_id,recipient_ref,channel,${randomUUID()},payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at from public.message_deliveries where id=${child.id}`))).rejects.toMatchObject({ cause: { code: "42501" } });
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        await transaction.execute(sql`delete from public.message_deliveries where id=${child.id}`);
        expect((await transaction.execute(sql`select operation_id from public.messaging_notification_recovery_origins where operation_id=${recoveryOperationId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select resource_id,operation_id,resource_version,rule,cause,metadata,created_at from public.academy_admission_retired_audit_events where tribe_id=${fixture.context.tribeId} and event_type='notification_delivery_recovered'`)).rows).toEqual(originalAudit);
      });
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);

  it("should block an uncertain original attempt and preserve its consumed reservation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotificationDeliveryRecovery(database);
      const attemptId = randomUUID(), reservationId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.message_deliveries set state='unknown' where id=${fixture.context.deliveryId}`);
        await transaction.execute(sql`insert into public.message_delivery_attempts(id,delivery_id,tribe_id,connection_id,connection_version,sequence,reservation_id,lease_token,send_authorized_at,authorized_usage_policy_version,state) values (${attemptId},${fixture.context.deliveryId},${fixture.context.tribeId},${fixture.originalConnectionId},1,1,${reservationId},${randomUUID()},clock_timestamp(),1,'unknown')`);
        await transaction.execute(sql`insert into public.messaging_usage_reservations(id,tribe_id,attempt_id,delivery_id,category,reserved_at) values (${reservationId},${fixture.context.tribeId},${attemptId},${fixture.context.deliveryId},'notification',clock_timestamp())`);
      });
      // A definitive rejection that rolled back, naming the unresolved previous send as its typed cause.
      await expect(fixture.repository.recover(fixture.context, fixture.input)).rejects.toMatchObject({ code: "original_dispatch_unresolved", cause: { name: "MessagingRequirementError", code: "notification_recovery_original_dispatch_unresolved" } });
      const state = await database.withContext(fixture.own, async (transaction) => ({
        original: (await transaction.execute(sql`select state,version from public.message_deliveries where id=${fixture.context.deliveryId}`)).rows[0],
        attempt: (await transaction.execute(sql`select state,version from public.message_delivery_attempts where id=${attemptId}`)).rows[0],
        reservation: (await transaction.execute(sql`select state from public.messaging_usage_reservations where id=${reservationId}`)).rows[0],
        effects: (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where recovery_of_delivery_id=${fixture.context.deliveryId}) as children,(select count(*)::int from public.academy_admission_audit_events where tribe_id=${fixture.context.tribeId} and event_type='notification_delivery_recovered') as audits`)).rows[0],
      }));
      expect(state).toEqual({ original: { state: "unknown", version: 1 }, attempt: { state: "unknown", version: 1 }, reservation: { state: "consumed" }, effects: { children: 0, audits: 0 } });
    });
  });

  it("should recover an explicitly rejected original without releasing its charge or reusing its attempt", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotificationDeliveryRecovery(database);
      const attemptId = randomUUID(), reservationId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.message_deliveries set state='failed' where id=${fixture.context.deliveryId}`);
        await transaction.execute(sql`insert into public.message_delivery_attempts(id,delivery_id,tribe_id,connection_id,connection_version,sequence,reservation_id,lease_token,send_authorized_at,authorized_usage_policy_version,state,completed_at) values (${attemptId},${fixture.context.deliveryId},${fixture.context.tribeId},${fixture.originalConnectionId},1,1,${reservationId},${randomUUID()},clock_timestamp(),1,'rejected',clock_timestamp())`);
        await transaction.execute(sql`insert into public.messaging_usage_reservations(id,tribe_id,attempt_id,delivery_id,category,reserved_at) values (${reservationId},${fixture.context.tribeId},${attemptId},${fixture.context.deliveryId},'notification',clock_timestamp())`);
      });
      const result = await fixture.repository.recover(fixture.context, fixture.input);
      expect(result.state).toBe("completed");
      const state = await database.withContext(fixture.own, async (transaction) => ({
        original: (await transaction.execute(sql`select state,version from public.message_deliveries where id=${fixture.context.deliveryId}`)).rows[0],
        attempt: (await transaction.execute(sql`select id,state,version from public.message_delivery_attempts where id=${attemptId}`)).rows[0],
        reservations: (await transaction.execute(sql`select id,state from public.messaging_usage_reservations where id=${reservationId}`)).rows,
        children: (await transaction.execute(sql`select count(*)::int as count from public.message_deliveries where recovery_of_delivery_id=${fixture.context.deliveryId}`)).rows[0].count,
        audit: (await transaction.execute(sql`select event.actor_user_id,event.resource_version,event.rule,event.cause,event.metadata,event.created_at=delivery.created_at as owner_clock,operation.idempotency_key from public.academy_admission_audit_events event join public.message_deliveries delivery on delivery.id=event.resource_id and delivery.tribe_id=event.tribe_id join public.academy_admission_operations operation on operation.id=event.operation_id and operation.tribe_id=event.tribe_id where event.tribe_id=${fixture.context.tribeId} and event.event_type='notification_delivery_recovered'`)).rows,
      }));
      expect(state).toEqual({ original: { state: "failed", version: 2 }, attempt: { id: attemptId, state: "rejected", version: 1 }, reservations: [{ id: reservationId, state: "consumed" }], children: 1, audit: [{ actor_user_id: fixture.context.actorUserId, resource_version: 1, rule: "explicit_notification_recovery", cause: "authorized_connection_replacement", owner_clock: true, idempotency_key: fixture.input.operationId, metadata: { fromState: null, toState: "queued", previousVersion: null, connectionId: fixture.input.targetConnectionId, connectionVersion: fixture.targetConfigurationVersion, channel: "email", attemptId: null, authorizedUsagePolicyVersion: null, originalDeliveryId: fixture.context.deliveryId, targetConnectionId: fixture.input.targetConnectionId, originalConnectionId: fixture.originalConnectionId, originalConnectionVersion: 1, originalFromState: "failed", originalToState: "failed", previousOriginalVersion: 1, originalVersion: 2, originalAttemptId: attemptId, originalAuthorizedUsagePolicyVersion: 1 } }] });
    });
  });

  it("should roll back all staged effects when the external security epoch changes in the final ledger wait", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotificationDeliveryRecovery(database);
      const sendsBefore = fixture.transport.receipts.length;
      const wait = prepareFinalWait(fixture);
      try {
        await Promise.race([wait.entered, wait.outcome.then(() => { throw new Error("Recovery ended before its real staged final wait"); })]);
        wait.setEpoch("changed-after-staging");
        wait.release();
        const outcome = await wait.outcome;
        // A notice prepared under another security epoch can never be recovered.
        expect(outcome.error).toMatchObject({ code: "resource_unavailable", cause: { name: "MessagingRequirementError", code: "notification_recovery_security_scope_changed" } });
        expect(outcome.result).toBeNull();
        const observed = await database.withContext(fixture.own, async (transaction) => ({
          original: (await transaction.execute(sql`select state,version from public.message_deliveries where id=${fixture.context.deliveryId}`)).rows[0],
          effects: (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where recovery_of_delivery_id=${fixture.context.deliveryId}) as children,(select count(*)::int from public.academy_admission_audit_events where tribe_id=${fixture.context.tribeId} and event_type='notification_delivery_recovered') as audits`)).rows[0],
        }));
        expect(observed).toEqual({ original: { state: "suppressed", version: 1 }, effects: { children: 0, audits: 0 } });
        expect(fixture.transport.receipts).toHaveLength(sendsBefore);
      } finally { wait.release(); await wait.outcome; }
    });
  });

  it("should roll back all staged effects when the original deadline crosses during the final ledger wait", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotificationDeliveryRecovery(database, 60_000);
      const wait = prepareFinalWait(fixture);
      try {
        await Promise.race([wait.entered, wait.outcome.then(() => { throw new Error("Recovery ended before its real staged final wait"); })]);
        await wait.waitForOriginalDeadline();
        wait.release();
        const error = (await wait.outcome).error;
        const causeCodes: string[] = [];
        const seenCauses = new Set<object>();
        let current: unknown = error;
        while (current && typeof current === "object" && !seenCauses.has(current)) {
          seenCauses.add(current);
          if ("code" in current && typeof current.code === "string" && /^[A-Z0-9_]+$/iu.test(current.code)) causeCodes.push(current.code);
          current = "cause" in current ? current.cause : null;
        }
        const code = error && typeof error === "object" && "code" in error ? error.code : null;
        expect(code, JSON.stringify({ code, causeCodes, stagedTiming: wait.stagedTiming })).toBe("challenge_expired");
        const observed = await database.withContext(fixture.own, async (transaction) => ({
          original: (await transaction.execute(sql`select state,version from public.message_deliveries where id=${fixture.context.deliveryId}`)).rows[0],
          effects: (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where recovery_of_delivery_id=${fixture.context.deliveryId}) as children,(select count(*)::int from public.academy_admission_audit_events where tribe_id=${fixture.context.tribeId} and event_type='notification_delivery_recovered') as audits`)).rows[0],
        }));
        expect(observed).toEqual({ original: { state: "suppressed", version: 1 }, effects: { children: 0, audits: 0 } });
      } finally { wait.release(); await wait.outcome; }
    });
  });
});
