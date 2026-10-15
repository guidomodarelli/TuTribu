/** @vitest-environment node */
/** Exercises existing recovery data at the real versioned storage boundary, including rejected-commit rollback. @module notification-recovery-origin-cutover-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import migrationJournal from "@/database/migrations/meta/_journal.json";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { seedContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { NOTIFICATION_RECOVERY_ORIGIN_TEST, NOTIFICATION_RECOVERY_ORIGIN_LOCK_ORDER } from "@/tests/support/constants/notification-recovery-origin";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";
import { MEMBERSHIP_LIFECYCLE_OBSERVATION_INTERVAL_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MESSAGING_CONNECTION_STATE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { MESSAGE_DELIVERY_STATE } from "@/src/modules/messaging/constants/message-delivery";
import { NOTIFICATION_DELIVERY_RECOVERY_AUDIT, NOTIFICATION_DELIVERY_RECOVERY_PURPOSE } from "@/src/modules/messaging/constants/notification-delivery-recovery";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { createAdmissionResourceAuditEvent } from "@/src/modules/academy-admissions/domain/entities/admission-resource-audit-event";
import { PostgresAdmissionAuditRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-audit-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Supplies actual scoped parents and original clocks without any external transport. */
type RecoveryOriginScope = {
  tribeId: string; userId: string; originalConnectionId: string; targetConnectionId: string;
  environment: string; securityEpoch: string; now: Date;
};

/**
 * Inserts a coherent recovery through the existing deferred lineage/audit constraints.
 * @param transaction - Actual guarded native transaction on the owned branch.
 * @param scope - Its current synthetic tenant, account, connection parents and SQL clock.
 * @param includeAudit - Whether to complete the mandatory atomic fact or test its rejection.
 * @returns The exact opaque identities needed to observe upgrade and rollback.
 */
async function insertRecoveryOriginScenario(transaction: RequestDatabase, scope: RecoveryOriginScope, includeAudit: boolean) {
  const originalId = randomUUID(), childId = randomUUID(), operationId = randomUUID(), sourceId = randomUUID();
  const deadline = new Date(scope.now.getTime() + NOTIFICATION_RECOVERY_ORIGIN_TEST.deliveryLifetimeMs);
  const fingerprint = randomBytes(MESSAGING_CRYPTO.keyBytes), keyId = randomUUID();
  await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,state,version,created_at,due_at,deadline_at) values (${originalId},${scope.tribeId},${scope.originalConnectionId},1,${scope.environment},${scope.securityEpoch},${NOTIFICATION_DELIVERY_RECOVERY_PURPOSE},${sourceId},${scope.userId},${scope.userId},${MESSAGING_PUBLIC_CHANNEL.email},${randomUUID()},${fingerprint},${keyId},'{}',1,${MESSAGE_DELIVERY_STATE.cancelled},2,${scope.now},${scope.now},${deadline})`);
  await transaction.execute(sql`insert into public.academy_admission_operations(id,tribe_id,actor_user_id,operation_type,idempotency_key,intent_fingerprint,fingerprint_key_id,state,public_result,created_at,completed_at) values (${operationId},${scope.tribeId},${scope.userId},${REAUTHENTICATION_OPERATION.recoverNotificationDelivery},${randomUUID()},${fingerprint},${keyId},${OPERATION_STATE.completed},'{}',${scope.now},${scope.now})`);
  await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,recovery_of_delivery_id,recovery_operation_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) values (${childId},${scope.tribeId},${scope.targetConnectionId},1,${scope.environment},${scope.securityEpoch},${NOTIFICATION_DELIVERY_RECOVERY_PURPOSE},${sourceId},${originalId},${operationId},${scope.userId},${scope.userId},${MESSAGING_PUBLIC_CHANNEL.email},${operationId},${fingerprint},${keyId},'{}',1,${scope.now},${scope.now},${deadline})`);
  if (includeAudit) await new PostgresAdmissionAuditRepository(transaction).append(createAdmissionResourceAuditEvent({
    tribeId: scope.tribeId, actorUserId: scope.userId, operationId,
    resourceType: NOTIFICATION_DELIVERY_RECOVERY_AUDIT.resourceType, resourceId: childId,
    eventType: NOTIFICATION_DELIVERY_RECOVERY_AUDIT.eventType,
    rule: NOTIFICATION_DELIVERY_RECOVERY_AUDIT.rule, cause: NOTIFICATION_DELIVERY_RECOVERY_AUDIT.cause,
    resourceVersion: 1, createdAt: scope.now,
    metadata: { fromState: null, toState: MESSAGE_DELIVERY_STATE.queued, previousVersion: null,
      connectionId: scope.targetConnectionId, connectionVersion: 1, channel: MESSAGING_PUBLIC_CHANNEL.email,
      attemptId: null, authorizedUsagePolicyVersion: null, originalDeliveryId: originalId,
      targetConnectionId: scope.targetConnectionId, originalConnectionId: scope.originalConnectionId,
      originalConnectionVersion: 1, originalFromState: MESSAGE_DELIVERY_STATE.suppressed,
      originalToState: MESSAGE_DELIVERY_STATE.cancelled, previousOriginalVersion: 1, originalVersion: 2,
      originalAttemptId: null, originalAuthorizedUsagePolicyVersion: null },
  }));
  return { originalId, childId, operationId };
}

/**
 * Applies the actual preceding artifacts and seeds an existing, fully guarded recovery.
 * @param database - This test's privately owned branch, still at the normal baseline.
 * @returns The real upgrade statements and current native source identities.
 */
async function prepareRecoveryOriginCutover(database: AcademyAdmissionTestDatabase) {
  const cutover = migrationJournal.entries.find((entry) => entry.tag === NOTIFICATION_RECOVERY_ORIGIN_TEST.migrationTag);
  if (!cutover) throw new Error("Recovery origin migration is absent from the actual journal");
  const latest = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ latest: string }>(sql`select max(created_at)::text as latest from drizzle.__drizzle_migrations`)).rows[0].latest);
  const migrations = readMigrationFiles({ migrationsFolder: "database/migrations" });
  const migration = migrations.find((entry) => entry.folderMillis === cutover.when);
  if (!migration) throw new Error("Recovery origin upgrade statements are unavailable");
  const preceding = migrations.filter((entry) => entry.folderMillis > Number(latest) && entry.folderMillis < cutover.when);
  await database.withContext({ userId: null, email: null }, (transaction) => transaction.execute(sql.raw(preceding.flatMap((entry) => entry.sql).join("\n;\n"))));
  const fixture = await seedContactVerificationDatabase(database);
  const tribeId = randomUUID(), originalConnectionId = randomUUID(), targetConnectionId = randomUUID();
  const scope = await database.withContext(fixture.own, async (transaction): Promise<RecoveryOriginScope> => {
    const now = new Date((await transaction.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic retained recovery',${randomUUID()},${fixture.userId})`);
    for (const connectionId of [originalConnectionId,targetConnectionId]) {
      await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_candidate) values (${connectionId},${tribeId},${fixture.userId},${MESSAGING_CONNECTION_STATE.draft},${fixture.config.environment},${fixture.config.securityEpoch},false)`);
      await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch) values (${connectionId},${tribeId},1,${fixture.config.environment},${fixture.config.securityEpoch})`);
    }
    return { tribeId, userId: fixture.userId, originalConnectionId, targetConnectionId, environment: fixture.config.environment, securityEpoch: fixture.config.securityEpoch, now };
  });
  const recovery = await database.withContext(fixture.own, (transaction) => insertRecoveryOriginScenario(transaction, scope, true));
  return { cutover, migration, fixture, scope, recovery };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native notification recovery origin cutover", () => {
  it("should backfill existing origins, preserve live deletion protection and roll back an unaudited registration", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { cutover, fixture, scope, recovery } = await prepareRecoveryOriginCutover(database);
      const { tribeId } = scope;
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.tribes where id=${tribeId}`))).rejects.toMatchObject({ cause: { code: "23503", constraint: "messaging_delivery_recovery_operation_fkey" } });
      await database.applyMigration(`${cutover.tag}.sql`);
      const readOrigins = () => database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select operation_id,tribe_id from public.messaging_notification_recovery_origins where tribe_id=${tribeId}`)).rows);
      expect(await readOrigins()).toEqual([{ operation_id: recovery.operationId, tribe_id: tribeId }]);
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.academy_admission_operations where id=${recovery.operationId}`))).rejects.toMatchObject({ cause: { code: "23503" } });
      // The deferred guard rejects COMMIT through pg directly, without a Drizzle query wrapper.
      await expect(database.withContext(fixture.own, (transaction) => insertRecoveryOriginScenario(transaction, scope, false))).rejects.toMatchObject({ code: "23514" });
      expect(await readOrigins()).toEqual([{ operation_id: recovery.operationId, tribe_id: tribeId }]);
      await database.grantTablesToNonBypass(["messaging_notification_recovery_origins"]);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select operation_id from public.messaging_notification_recovery_origins`)).rows, "non_bypass")).toEqual([]);
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.messaging_notification_recovery_origins(operation_id,tribe_id) values (${randomUUID()},${tribeId})`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`delete from public.tribes where id=${tribeId}`);
        expect((await transaction.execute(sql`select operation_id,tribe_id from public.messaging_notification_recovery_origins where tribe_id=${tribeId}`)).rows).toEqual([{ operation_id: recovery.operationId, tribe_id: tribeId }]);
        expect((await transaction.execute(sql`select cause from public.academy_admission_retired_audit_events where resource_id=${recovery.childId}`)).rows).toContainEqual({ cause: NOTIFICATION_DELIVERY_RECOVERY_AUDIT.cause });
        await transaction.execute(sql`delete from public.message_deliveries where id=${recovery.childId}`);
        expect((await transaction.execute(sql`select operation_id from public.messaging_notification_recovery_origins where tribe_id=${tribeId}`)).rows).toEqual([]);
      });
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);

  it.each([NOTIFICATION_RECOVERY_ORIGIN_LOCK_ORDER.writerFirst,NOTIFICATION_RECOVERY_ORIGIN_LOCK_ORDER.migrationFirst])("should finish the %s lock order without an upgrade cycle or a partial cutover", async (order) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, scope, recovery, cutover, migration } = await prepareRecoveryOriginCutover(database);
      let releaseWriter!: () => void, releaseMigration!: () => void;
      const writerGate = new Promise<void>((resolve) => { releaseWriter = resolve; });
      const migrationGate = new Promise<void>((resolve) => { releaseMigration = resolve; });
      let markWriterStarted!: (pid: number) => void, markWriterLocked!: (pid: number) => void;
      let markMigrationStarted!: (pid: number) => void, markMigrationLocked!: (pid: number) => void;
      const writerStarted = new Promise<number>((resolve) => { markWriterStarted = resolve; });
      const writerLocked = new Promise<number>((resolve) => { markWriterLocked = resolve; });
      const migrationStarted = new Promise<number>((resolve) => { markMigrationStarted = resolve; });
      const migrationLocked = new Promise<number>((resolve) => { markMigrationLocked = resolve; });
      let migrationSettled = false, writerSettled = false;
      let writer: Promise<{ error: unknown }> | undefined, upgrade: Promise<{ error: unknown }> | undefined;
      /** @returns A native owner retaining the same tenant/operation/delivery table locks as the real writer. */
      const startWriter = () => database.withContext(fixture.own, async (transaction) => {
        const pid = (await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid;
        markWriterStarted(pid);
        await transaction.execute(sql`select id from public.tribes where id=${scope.tribeId} for update`);
        await transaction.execute(sql`select id from public.academy_admission_operations where id=${recovery.operationId} for update`);
        await transaction.execute(sql`select id from public.message_deliveries where id=${recovery.originalId} for update`);
        markWriterLocked(pid); await writerGate;
        await transaction.execute(sql`update public.message_deliveries set last_outcome=last_outcome where id=${recovery.originalId}`);
      }).then(() => ({ error: null }), (error: unknown) => ({ error })).finally(() => { writerSettled = true; });
      /** @returns Execution of genuine migrator statements, with an observation gate after the actual initial lock. */
      const startUpgrade = () => database.withContext({ userId: null, email: null }, async (transaction) => {
        const pid = (await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid;
        markMigrationStarted(pid);
        const [lockStep,...remainingSteps] = migration.sql;
        await transaction.execute(sql.raw(lockStep)); markMigrationLocked(pid);
        if (order === NOTIFICATION_RECOVERY_ORIGIN_LOCK_ORDER.migrationFirst) await migrationGate;
        for (const statement of remainingSteps) await transaction.execute(sql.raw(statement));
      }).then(() => ({ error: null }), (error: unknown) => ({ error })).finally(() => { migrationSettled = true; });
      /** @param pid - Only this test's observed backend. @returns Native blocking PIDs, without queries, values or row data. */
      const blockers = (pid: number) => database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ blockers: number[] }>(sql`select pg_blocking_pids(${pid}) as blockers`)).rows[0].blockers);
      /** @param gate - Actual native stage signal. @param run - Its active owner. @returns The backend PID, or a prompt failure if the owner ends before the gate. */
      const observeGate = (gate: Promise<number>, run: Promise<{ error: unknown }>) => Promise.race([gate,run.then(({ error }) => { throw new Error("Native lock owner ended before its observation gate", { cause: error }); })]);
      try {
        if (order === NOTIFICATION_RECOVERY_ORIGIN_LOCK_ORDER.writerFirst) {
          writer = startWriter(); const writerPid = await observeGate(writerLocked,writer);
          upgrade = startUpgrade(); const migrationPid = await observeGate(migrationStarted,upgrade);
          while (!migrationSettled) {
            if ((await blockers(migrationPid)).includes(writerPid)) { releaseWriter(); break; }
            if (!migrationSettled) await new Promise<void>((resolve) => setTimeout(resolve, MEMBERSHIP_LIFECYCLE_OBSERVATION_INTERVAL_MS));
          }
          releaseWriter();
          expect((await upgrade).error).toMatchObject({ cause: { code: "55P03" } });
          expect((await writer).error).toBeNull();
          expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select to_regclass('public.messaging_notification_recovery_origins') is null as unchanged`)).rows)).toEqual([{ unchanged: true }]);
          await database.applyMigration(`${cutover.tag}.sql`);
        } else {
          upgrade = startUpgrade(); const migrationPid = await observeGate(migrationLocked,upgrade);
          writer = startWriter(); const writerPid = await observeGate(writerStarted,writer);
          let observedBlocked = false;
          while (!observedBlocked) {
            if (writerSettled || migrationSettled) throw new Error("Native lock observation requires both active owners");
            observedBlocked = (await blockers(writerPid)).includes(migrationPid);
            if (!observedBlocked) await new Promise<void>((resolve) => setTimeout(resolve, MEMBERSHIP_LIFECYCLE_OBSERVATION_INTERVAL_MS));
          }
          expect(observedBlocked).toBe(true); releaseMigration(); releaseWriter();
          expect((await upgrade).error).toBeNull(); expect((await writer).error).toBeNull();
        }
        await database.withContext(fixture.own, async (transaction) => {
          expect((await transaction.execute(sql`select operation_id,tribe_id from public.messaging_notification_recovery_origins where tribe_id=${scope.tribeId}`)).rows).toEqual([{ operation_id: recovery.operationId, tribe_id: scope.tribeId }]);
          expect((await transaction.execute(sql`select state,version from public.message_deliveries where id=${recovery.originalId}`)).rows).toEqual([{ state: MESSAGE_DELIVERY_STATE.cancelled, version: 2 }]);
        });
      } finally {
        releaseMigration(); releaseWriter(); await Promise.allSettled([writer,upgrade].filter((run) => run !== undefined));
      }
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
