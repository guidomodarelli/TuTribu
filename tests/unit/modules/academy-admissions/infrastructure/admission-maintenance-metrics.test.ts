/** @vitest-environment node */
/** Verifies observations from actual committed maintenance and internal-notice effects, without a synthetic job or provider. @module admission-maintenance-metrics-tests */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionPrivateRetention } from "@/tests/support/admission-private-retention-fixture";
import { prepareAllowlistImportRetention } from "@/tests/support/allowlist-import-retention-fixture";
import { buildAdmissionDataRetentionModule } from "@/src/modules/academy-admissions/setup";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";
import { PostgresAdmissionPrivateDataRetention } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-private-data-retention";
import { PostgresAdmissionActivityReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-activity-reader";
import { ADMISSION_METRIC_RUN_OPERATION, ADMISSION_METRIC_PHASE } from "@/src/modules/academy-admissions/constants/admission-metrics";

/** @param database - Exact disposable branch with cleanup owned by its harness. @returns Real reader and original private maintenance owner, with a fresh actual manager session. */
async function prepareObservedMaintenance(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareAdmissionPrivateRetention(database), sessionId = randomUUID();
  const own = { userId: fixture.managerId, email: null };
  await database.withContext(own, (transaction) => transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.managerId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`));
  const reader = new PostgresAdmissionActivityReader((_scope, run) => database.withContext(own, run));
  const scope = { tribeId: fixture.tribeId, userId: fixture.managerId, sessionId, requestId: randomUUID() };
  const backend = { userId: null, email: null };
  const retention = new PostgresAdmissionPrivateDataRetention((run) => database.withContext(backend, run), async () => true, async () => false);
  return { fixture, own, backend, reader, scope, retention };
}

/** @param stage - Fixed test operation; never input, SQL or a URL. @param run - Actual branch workflow. @returns After its private callbacks have settled. @throws An observation-safe failure without private browser/SQL arguments. */
async function observePrivateCase(stage: string, run: () => Promise<void>) {
  try { await run(); }
  catch (error) {
    // A failed SQL assertion may retain session parameters; the test observer deliberately discards that private cause.
    let current: unknown = error, sqlCode: string | null = null;
    for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
      const code: unknown = Reflect.get(current, "code");
      if (typeof code === "string" && /^[A-Z0-9]{5}$/u.test(code)) sqlCode = code;
      current = current.cause;
    }
    throw new Error(`Native maintenance observation failed: stage=${stage}; category=${error instanceof Error ? error.name : "unavailable"}; sqlCode=${sqlCode ?? "absent"}`);
  }
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native maintenance observations", () => {
  it("should observe CSV-only cleanup per affected tribe without treating a no-op or fresh import as successful work", async () => {
    await observePrivateCase("csv_only_retention", () => withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistImportRetention(database), sessionId = randomUUID();
      const backend = { userId: null, email: null };
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`));
      const reader = new PostgresAdmissionActivityReader((_scope, run) => database.withContext(fixture.own, run));
      const maintenance = buildAdmissionDataRetentionModule({ execute: (run) => database.withContext(backend, run), authorize: async () => true, readRecoveryLock: async () => false }).useCases.purgeData;
      const result = await maintenance.execute();
      expect(result).toMatchObject({ importMaterial: { purgedRows: 6, completedImports: 2 }, privateData: { requestsMinimized: 0, auditEventsPurged: 0, archivedAuditEventsPurged: 0 } });
      const completedImport = fixture.cases.find((entry) => entry.name === "completed")!;
      const facts = await database.withServerEnvironment(async (environment) => {
        const client = new Client({ connectionString: environment.DATABASE_URL });
        try {
          await client.connect();
          return (await client.query<{ audited: number; workerRuns: number; requestRoleCanRead: boolean }>("select count(*)::int as audited,(select count(*)::int from public.academy_admission_worker_runs where tribe_id=$1) as \"workerRuns\",has_function_privilege($2,'public.read_academy_admission_metrics(uuid,text)','EXECUTE') as \"requestRoleCanRead\" from public.academy_admission_audit_events where tribe_id=$1 and resource_type='retention_run' and metadata->>'owner'='allowlist_import_material'", [completedImport.tribeId,database.nonBypassRole.name])).rows[0];
        } finally { await client.end(); }
      });
      const scope = { tribeId: completedImport.tribeId, userId: fixture.userId, sessionId, requestId: randomUUID() };
      const before = await reader.readMetrics(scope);
      process.stdout.write(JSON.stringify({ phase: "csv_only_retention_facts", purgedRows: result.importMaterial.purgedRows, audited: facts.audited, lastOperation: before.lastSuccessfulRun?.operation ?? null, workerRuns: facts.workerRuns }) + "\n");
      expect(facts).toEqual({ audited: 1, workerRuns: 0, requestRoleCanRead: true });
      for (const entry of fixture.cases) {
        const currentScope = { ...scope, tribeId: entry.tribeId };
        const metrics = await reader.readMetrics(currentScope);
        const retentionSamples = metrics.durations.find((sample) => sample.phase === "retention");
        if (entry.name === "fresh") {
          expect(metrics.lastSuccessfulRun).toBeNull();
          expect(retentionSamples).toBeUndefined();
        } else {
          expect(metrics.lastSuccessfulRun?.operation).toBe("admission_retention");
          expect(retentionSamples?.sampleCount).toBe(1);
          const activity = await reader.readActivity(currentScope, { limit: 50, resourceType: "retention_run" });
          expect(activity.items).toHaveLength(1);
          expect(activity.items[0]).toMatchObject({ eventType: "retention_completed", rule: "purge_allowlist_import_material", changes: { owner: "allowlist_import_material", processed: 3, remaining: false } });
        }
      }
      expect((await maintenance.execute()).importMaterial).toEqual({ purgedRows: 0, completedImports: 0 });
      const after = await reader.readMetrics(scope);
      expect(after.lastSuccessfulRun).toEqual(before.lastSuccessfulRun);
      expect(after.durations).toEqual(before.durations);
    }));
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);

  it("should publish the real completed retention phase and preserve it on a no-op without adding a worker run", async () => {
    await observePrivateCase("retention_completion", () => withAcademyAdmissionDatabase(async (database) => {
      const { fixture, backend, scope, reader, retention } = await prepareObservedMaintenance(database);
      const result = await retention.purge({ requestLimit: 10, auditLimit: 20 });
      expect(result.requestsMinimized).toBeGreaterThan(0);
      expect(result.archivedAuditEventsPurged).toBeGreaterThan(0);
      const facts = await database.withServerEnvironment(async (environment) => {
        const client = new Client({ connectionString: environment.DATABASE_URL });
        try {
          await client.connect();
          return (await client.query<{ completed: number; timed: number; completedAt: Date | null; workerRuns: number }>("select count(*)::int as completed,count(*) filter (where metadata ? 'durationMs')::int as timed,max(created_at) as \"completedAt\",(select count(*)::int from public.academy_admission_worker_runs where tribe_id=$1) as \"workerRuns\" from public.academy_admission_audit_events where tribe_id=$1 and resource_type='retention_run' and event_type='retention_completed'", [fixture.tribeId])).rows[0];
        } finally { await client.end(); }
      });
      const metrics = await reader.readMetrics(scope);
      process.stdout.write(JSON.stringify({ phase: "retention_observation_facts", completed: facts.completed, timed: facts.timed, lastOperation: metrics.lastSuccessfulRun?.operation ?? null, retentionSamples: metrics.durations.find((sample) => sample.phase === ADMISSION_METRIC_PHASE.retention)?.sampleCount ?? 0 }) + "\n");
      expect(facts.completed).toBeGreaterThan(0);
      expect(facts.workerRuns).toBe(0);
      expect(facts.timed).toBe(facts.completed);
      expect(metrics.lastSuccessfulRun?.operation).toBe(ADMISSION_METRIC_RUN_OPERATION.admissionRetention);
      expect(metrics.lastSuccessfulRun?.at).toBe(facts.completedAt?.toISOString());
      expect(metrics.durations.find((sample) => sample.phase === ADMISSION_METRIC_PHASE.retention)?.sampleCount).toBe(facts.timed);
      const lastSuccessfulRun = metrics.lastSuccessfulRun, samples = metrics.durations;
      expect(await retention.purge({ requestLimit: 10, auditLimit: 20 })).toMatchObject({ requestsMinimized: 0, auditEventsPurged: 0, archivedAuditEventsPurged: 0 });
      const unchanged = await reader.readMetrics(scope);
      expect(unchanged.lastSuccessfulRun).toEqual(lastSuccessfulRun);
      expect(unchanged.durations).toEqual(samples);
      const original = await database.withContext(backend, (transaction) => transaction.execute(sql`select id,metadata,created_at from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and resource_type='retention_run' order by id`));
      await database.withContext(backend, (transaction) => transaction.execute(sql`delete from public.tribes where id=${fixture.tribeId}`));
      const archived = await database.withContext(backend, (transaction) => transaction.execute(sql`select id,metadata,created_at from public.academy_admission_retired_audit_events where tribe_id=${fixture.tribeId} and resource_type='retention_run' order by id`));
      expect(archived.rows).toEqual(original.rows);
    }));
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);

  it("should recognize committed internal materialization without inventing a driver and preserve its original phase samples", async () => {
    await observePrivateCase("internal_materialization", () => withAcademyAdmissionDatabase(async (database) => {
      const { reader, scope } = await prepareObservedMaintenance(database);
      const before = await reader.readMetrics(scope);
      process.stdout.write(JSON.stringify({ phase: "internal_materialization_facts", lastOperation: before.lastSuccessfulRun?.operation ?? null, notificationSamples: before.durations.find((sample) => sample.phase === ADMISSION_METRIC_PHASE.notification)?.sampleCount ?? 0 }) + "\n");
      expect(before.durations.find((sample) => sample.phase === ADMISSION_METRIC_PHASE.notification)?.sampleCount).toBeGreaterThan(0);
      expect(before.lastSuccessfulRun?.operation).toBe(ADMISSION_METRIC_RUN_OPERATION.notificationMaterialization);
      const after = await reader.readMetrics(scope);
      expect(after.lastSuccessfulRun).toEqual(before.lastSuccessfulRun);
      expect(after.durations).toEqual(before.durations);
    }));
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);

  it("should roll back retention observations with their effects when the original transaction fails", async () => {
    await observePrivateCase("retention_rollback", () => withAcademyAdmissionDatabase(async (database) => {
      const { own, backend, reader, scope } = await prepareObservedMaintenance(database);
      const before = await reader.readMetrics(scope);
      let stagedObservations = 0;
      const interrupted = new PostgresAdmissionPrivateDataRetention((run) => database.withContext(backend, async (transaction) => {
        await run(transaction);
        stagedObservations = (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_audit_events where tribe_id=${scope.tribeId} and resource_type='retention_run'`)).rows[0].count;
        throw new Error("Controlled maintenance rollback");
      }), async () => true, async () => false);
      await expect(interrupted.purge({ requestLimit: 10, auditLimit: 20 })).rejects.toMatchObject({ code: "operation_unresolved" });
      expect(stagedObservations).toBeGreaterThan(0);
      const after = await reader.readMetrics(scope);
      expect(after.lastSuccessfulRun).toEqual(before.lastSuccessfulRun);
      expect(after.durations).toEqual(before.durations);
      expect((await database.withContext(own, (transaction) => transaction.execute(sql`select count(*)::int as count from public.academy_admission_audit_events where tribe_id=${scope.tribeId} and resource_type='retention_run'`))).rows).toEqual([{ count: 0 }]);
    }));
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
