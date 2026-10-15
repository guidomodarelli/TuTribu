/** @vitest-environment node */
/** Exercises the existing readonly registry with genuine original email settings operations and native current authority. @module admission-email-settings-recovery-native-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionEmailSettings } from "@/tests/support/admission-notification-email-settings-fixture";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { authorizeAdmissionPolicy } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-authorizer";
import { admissionEmailSettingsChangeResultSchema } from "@/src/modules/notifications/application/results/admission-email-settings-result-schemas";

/** @param database - This exact owned branch. @param fixture - Genuine native identity and persisted prerequisites. @returns The existing query factory, with no configuration or keyring supplier for operation metadata reads. */
function queries(database: AcademyAdmissionTestDatabase, fixture: Awaited<ReturnType<typeof prepareAdmissionEmailSettings>>) {
  const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.own.userId, sessionId: fixture.read.sessionId }), (identity, run) => database.withContext({ userId: identity.userId, email: null }, run));
  return buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createQueryModule({ executePublic: (run) => database.withContext({ userId: null, email: null }, run), readRecoveryLock: async () => { throw new Error("Readonly operation recovery must not load hosting configuration"); } }).useCases;
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native original email settings recovery", { concurrent: true }, () => {
  it("should recover an original historical setting without fresh Google while refusing a new write and current role loss", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionEmailSettings(database);
      const first = fixture.command(0, false, "Asia/Kolkata"), later = fixture.command(1, false, "UTC");
      expect(await fixture.repository.change(fixture.change, first)).toMatchObject({ state: "completed", result: { status: "changed", settings: { version: 1 } } });
      expect(await fixture.repository.change(fixture.change, later)).toMatchObject({ state: "completed", result: { status: "changed", settings: { version: 2 } } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where session_id=${fixture.read.sessionId} and tribe_id=${fixture.read.tribeId}`));
      fixture.setRecoveryLocked(true);
      const query = { tribeId: fixture.read.tribeId, operationId: first.operationId, requestId: randomUUID() };
      const current = queries(database, fixture);
      const baseline = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as operations,sum(version)::int as versions from public.academy_admission_operations where tribe_id=${fixture.read.tribeId}`)).rows[0]);

      expect(await current.operation.execute(query)).toEqual({ ok: true, value: { type: "update_admission_email_settings", state: "completed", operationId: first.operationId, replayed: true, result: { status: "changed", settings: { enabled: false, version: 1, timeZone: "Asia/Kolkata" } } } });
      expect(await fixture.repository.get(fixture.read)).toMatchObject({ enabled: false, version: 2, timeZone: "UTC" });
      await expect(fixture.repository.change(fixture.change, fixture.command(2, true))).rejects.toMatchObject({ code: "reauthentication_required" });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as operations,sum(version)::int as versions from public.academy_admission_operations where tribe_id=${fixture.read.tribeId}`)).rows[0])).toEqual(baseline);

      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set status='muted' where tribe_id=${fixture.read.tribeId} and user_id=${fixture.own.userId}`));
      expect(await current.operation.execute(query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should retain genuine started progress without renewing its claim or initializing settings", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionEmailSettings(database), operationId = randomUUID();
      const ledger = new PostgresAdmissionOperationRepository((run) => database.withContext(fixture.own, run), async (transaction) => { await authorizeAdmissionPolicy(transaction, fixture.change, "update_admission_email_settings"); return true; }, async () => fixture.config);
      const command = { actorUserId: fixture.own.userId, tribeId: fixture.read.tribeId, operationType: "update_admission_email_settings", idempotencyKey: operationId, intent: { expectedVersion: 0, enabled: false, timeZone: "America/Argentina/Buenos_Aires" } };
      await expect(ledger.run(command, admissionEmailSettingsChangeResultSchema, async () => { throw new Error("Synthetic interruption after the original claim"); })).rejects.toMatchObject({ code: "operation_unresolved" });
      const before = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,version,lease_owner::text,lease_until::text from public.academy_admission_operations where tribe_id=${fixture.read.tribeId} and idempotency_key=${operationId}`)).rows[0]);
      expect(before).toMatchObject({ state: "started" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where session_id=${fixture.read.sessionId} and tribe_id=${fixture.read.tribeId}`));
      const query = { tribeId: fixture.read.tribeId, operationId, requestId: randomUUID() };

      expect(await queries(database, fixture).operation.execute(query)).toEqual({ ok: true, value: { type: "update_admission_email_settings", state: "started", operationId } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,version,lease_owner::text,lease_until::text from public.academy_admission_operations where tribe_id=${fixture.read.tribeId} and idempotency_key=${operationId}`)).rows[0])).toEqual(before);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as settings from public.admission_email_settings where tribe_id=${fixture.read.tribeId}`)).rows[0])).toEqual({ settings: 0 });
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should resume an interrupted original only after its lease expires while binding its exact body and preventing duplicate effects", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionEmailSettings(database), original = fixture.command(0, false, "Asia/Kolkata");
      const ledger = new PostgresAdmissionOperationRepository((run) => database.withContext(fixture.own, run), async (transaction) => { await authorizeAdmissionPolicy(transaction, fixture.change, "update_admission_email_settings"); return true; }, async () => fixture.config);
      const command = { actorUserId: fixture.own.userId, tribeId: fixture.read.tribeId, operationType: "update_admission_email_settings", idempotencyKey: original.operationId, intent: { expectedVersion: original.expectedVersion, enabled: original.enabled, timeZone: original.timeZone } };
      await expect(ledger.run(command, admissionEmailSettingsChangeResultSchema, async () => { throw new Error("Synthetic interruption after the original claim"); })).rejects.toMatchObject({ code: "operation_unresolved" });
      expect(await fixture.repository.change(fixture.change, original)).toEqual({ state: "started", operationId: original.operationId });
      await expect(fixture.repository.change(fixture.change, { ...original, timeZone: "UTC" })).rejects.toMatchObject({ code: "idempotency_conflict" });
      await database.withServerEnvironment(async (environment) => {
        const native = new Client({ connectionString: environment.DATABASE_URL });
        try {
          await native.connect(); await native.query("begin");
          await native.query("select set_config('app.current_user_id',$1,true)", [fixture.own.userId]);
          await expect(native.query("update public.academy_admission_operations set lease_until=clock_timestamp()-interval '1 second' where tribe_id=$1 and idempotency_key=$2 and state='started'", [fixture.read.tribeId, original.operationId])).rejects.toMatchObject({ code: "23514", message: "admission operation claim change requires one version increment" });
        } finally { await native.query("rollback"); await native.end(); }
      });
      const expired = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`update public.academy_admission_operations set lease_until=clock_timestamp()-interval '1 second',version=version+1 where tribe_id=${fixture.read.tribeId} and idempotency_key=${original.operationId} and state='started' returning state`)).rows);
      expect(expired).toEqual([{ state: "started" }]);
      expect(await fixture.repository.change(fixture.change, original)).toMatchObject({ state: "completed", operationId: original.operationId, replayed: false, result: { status: "changed", settings: { enabled: false, version: 1, timeZone: "Asia/Kolkata" } } });
      expect(await fixture.repository.change(fixture.change, original)).toMatchObject({ state: "completed", operationId: original.operationId, replayed: true, result: { status: "changed", settings: { version: 1 } } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_operations where tribe_id=${fixture.read.tribeId}) as operations,(select version from public.admission_email_settings where tribe_id=${fixture.read.tribeId}) as settings_version`)).rows[0])).toEqual({ operations: 1, settings_version: 1 });
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
