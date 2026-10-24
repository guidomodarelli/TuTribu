/** @vitest-environment node */
/** Exercises the real deferred storage guard and complete rollback on inconsistent recovery facts. @module notification-delivery-recovery-audit-guard-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareNotificationDeliveryRecovery } from "@/tests/support/notification-delivery-recovery-fixture";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("notification recovery deferred audit guard in PostgreSQL", () => {
  it("should reject inconsistent audit facts with complete rollback and commit the coherent control", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotificationDeliveryRecovery(database);
      const variants = ["missing_audit", "legacy_metadata", "wrong_actor", "wrong_original", "wrong_configuration_version", "wrong_original_version", "wrong_previous_version", "wrong_child_version", "wrong_clock", "invented_authorization", "wrong_original_state", "wrong_rule", "wrong_cause"];

      /**
       * Stages a coherent storage transaction with one deliberately inconsistent private fact.
       * No provider dispatch is performed; signatures and authorization are covered by the owner suite.
       * @param variant - Named corruption, or the coherent control.
       * @returns Committed child identity only after the real deferred constraint succeeds.
       */
      const stage = (variant: string) => database.withContext(fixture.own, async (transaction) => {
        const operationId = randomUUID(), childId = randomUUID();
        const original = (await transaction.execute<{ version: number; now: Date | string }>(sql`select version,date_trunc('milliseconds',clock_timestamp()) as now from public.message_deliveries where id=${fixture.context.deliveryId} for update`)).rows[0];
        const now = new Date(original.now);
        await transaction.execute(sql`insert into public.academy_admission_operations(id,actor_user_id,tribe_id,operation_type,idempotency_key,intent_fingerprint,fingerprint_key_id,state,public_result,completed_at) values (${operationId},${fixture.context.actorUserId},${fixture.context.tribeId},'recover_notification_delivery',${randomUUID()},${randomBytes(32)},'synthetic-audit-guard','completed',${{ originalDeliveryId: fixture.context.deliveryId, recoveryDeliveryId: childId, originalVersion: original.version + 1, targetConnectionId: fixture.input.targetConnectionId, targetConnectionVersion: fixture.targetConfigurationVersion }},${now})`);
        await transaction.execute(sql`update public.message_deliveries set state='cancelled',version=version+1 where id=${fixture.context.deliveryId}`);
        const child = (await transaction.execute<{ version: number }>(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,recovery_of_delivery_id,recovery_operation_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) select ${childId},tribe_id,${fixture.input.targetConnectionId},${fixture.targetConfigurationVersion},environment,security_epoch,purpose,source_resource_id,id,${operationId},actor_user_id,recipient_ref,channel,${operationId},${randomBytes(32)},'synthetic-audit-guard','{}',queued_usage_policy_version,${now},${now},deadline_at from public.message_deliveries where id=${fixture.context.deliveryId} returning version`)).rows[0];
        const metadata: Record<string, unknown> = {
          fromState: null, toState: "queued", previousVersion: null,
          connectionId: fixture.input.targetConnectionId, connectionVersion: fixture.targetConfigurationVersion, channel: "email",
          attemptId: null, authorizedUsagePolicyVersion: null,
          originalDeliveryId: fixture.context.deliveryId, targetConnectionId: fixture.input.targetConnectionId,
          originalConnectionId: fixture.originalConnectionId, originalConnectionVersion: 1,
          originalFromState: "suppressed", originalToState: "cancelled",
          previousOriginalVersion: original.version, originalVersion: original.version + 1,
          originalAttemptId: null, originalAuthorizedUsagePolicyVersion: null,
        };
        if (variant === "wrong_original") metadata.originalDeliveryId = randomUUID();
        if (variant === "wrong_configuration_version") metadata.originalConnectionVersion = 2;
        if (variant === "wrong_original_version") metadata.originalVersion = original.version;
        if (variant === "wrong_previous_version") metadata.previousOriginalVersion = original.version + 1;
        if (variant === "invented_authorization") metadata.authorizedUsagePolicyVersion = 1;
        if (variant === "wrong_original_state") metadata.originalFromState = "unknown";
        if (variant !== "missing_audit") {
          const auditMetadata = variant === "legacy_metadata" ? { originalDeliveryId: fixture.context.deliveryId, targetConnectionId: fixture.input.targetConnectionId } : metadata;
          const actorUserId = variant === "wrong_actor" ? null : fixture.context.actorUserId;
          const resourceVersion = variant === "wrong_child_version" ? child.version + 1 : child.version;
          const auditClock = variant === "wrong_clock" ? new Date(now.getTime() + 1) : now;
          const rule = variant === "wrong_rule" ? "synthetic_wrong_rule" : "explicit_notification_recovery";
          const cause = variant === "wrong_cause" ? "synthetic_wrong_cause" : "authorized_connection_replacement";
          await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,operation_id,event_type,rule,cause,resource_version,metadata,created_at) values (${fixture.context.tribeId},${actorUserId},'message_delivery',${childId},${operationId},'notification_delivery_recovered',${rule},${cause},${resourceVersion},${auditMetadata},${auditClock})`);
        }
        return childId;
      });

      for (const variant of variants) {
        // The transaction host commits through pg directly, so deferred failures expose the native code.
        await expect(stage(variant), variant).rejects.toMatchObject({ code: "23514" });
        const observed = await database.withContext(fixture.own, async (transaction) => ({
          original: (await transaction.execute(sql`select state,version from public.message_deliveries where id=${fixture.context.deliveryId}`)).rows[0],
          effects: (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where recovery_of_delivery_id=${fixture.context.deliveryId}) as children,(select count(*)::int from public.academy_admission_audit_events where tribe_id=${fixture.context.tribeId} and event_type='notification_delivery_recovered') as audits,(select count(*)::int from public.academy_admission_operations where tribe_id=${fixture.context.tribeId} and operation_type='recover_notification_delivery') as operations`)).rows[0],
        }));
        expect(observed, variant).toEqual({ original: { state: "suppressed", version: 1 }, effects: { children: 0, audits: 0, operations: 0 } });
      }

      const childId = await stage("coherent");
      const committed = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select child.id,event.created_at=child.created_at as same_clock,event.resource_version=child.version as same_version from public.message_deliveries child join public.academy_admission_audit_events event on event.resource_id=child.id and event.operation_id=child.recovery_operation_id where child.id=${childId}`)).rows);
      expect(committed).toEqual([{ id: childId, same_clock: true, same_version: true }]);
    });
  });
});
