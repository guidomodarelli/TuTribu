/** Composes the actual app workload on one authenticated disposable Node deployment. */
import { performance } from "node:perf_hooks";
import { sql } from "drizzle-orm";
import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { createAdmissionPerformanceDatabase } from "@/tests/support/admission-performance-database";
import { seedAdmissionPerformanceFixture } from "@/tests/support/admission-performance-fixture";
import { runAdmissionPerformanceWorkload } from "@/tests/support/run-admission-performance-workload";
import { createAdmissionNodeHostHandler } from "@/tests/support/admission-node-host-handler";
import { readPostgresTestDiagnostics } from "@/tests/support/postgres-test-diagnostics";
import { ADMISSION_NODE_HOST, ADMISSION_NODE_RUN_STATE, admissionNodeConfigurationSchema, admissionNodeMeasurementSchema, type AdmissionNodeRunState, type AdmissionNodeMeasurement, type AdmissionNodeStatus, type AdmissionNodeConnectionMetadata } from "@/tests/support/constants/admission-node-host";
import { startAdmissionCpuProfile, type AdmissionCpuObservation } from "@/tests/support/admission-cpu-profile";
import { ADMISSION_CPU_PROFILE } from "@/tests/support/constants/admission-cpu-profile";
import { ADMISSION_SAMPLE, admissionNodeSampleSchema, type AdmissionNodeSample } from "@/tests/support/constants/admission-sample";
import { ADMISSION_PERFORMANCE } from "@/tests/support/constants/admission-performance";
import { runAdmissionSample } from "@/tests/support/run-admission-sample";
import { ADMISSION_DATABASE_OBSERVATION } from "@/tests/support/constants/admission-database-observation";

const configuration = admissionNodeConfigurationSchema.parse({
  branchName: process.env[ADMISSION_NODE_HOST.branchVariable], operationId: process.env[ADMISSION_NODE_HOST.operationVariable], tokenSha256: process.env[ADMISSION_NODE_HOST.tokenDigestVariable],
  expiresAt: process.env[ADMISSION_NODE_HOST.expiresVariable], sourceCommit: process.env[ADMISSION_NODE_HOST.sourceCommitVariable], bundleSha256: process.env[ADMISSION_NODE_HOST.bundleDigestVariable],
});
const logger = createServerLogger({ feature: ADMISSION_NODE_HOST.operation, operation: ADMISSION_NODE_HOST.operation, requestId: configuration.operationId });
let resources: ReturnType<typeof createAdmissionPerformanceDatabase> | undefined;
let databaseConnection: AdmissionNodeConnectionMetadata | undefined;
/** @returns A lazy adapter; configuration and authentication precede its first use. */
function database() {
  if (!resources) {
    const value = process.env[ADMISSION_NODE_HOST.directDatabaseVariable] ?? process.env[ADMISSION_NODE_HOST.databaseVariable];
    if (!value) throw new Error("AdmissionNodeHost.database failed: injected_connection_unavailable");
    const connection = new URL(value);
    databaseConnection = { sourceVariable: process.env[ADMISSION_NODE_HOST.directDatabaseVariable] !== undefined ? ADMISSION_NODE_HOST.directDatabaseVariable : ADMISSION_NODE_HOST.databaseVariable, hostnameHasPoolerMarker: connection.hostname.includes(ADMISSION_NODE_HOST.poolerHostnameMarker) };
    connection.searchParams.set("sslmode", "verify-full");
    connection.searchParams.set("application_name", configuration.operationId);
    const selectedMaximum = process.env[ADMISSION_NODE_HOST.poolMaximumVariable];
    resources = createAdmissionPerformanceDatabase(createPostgresPool({ connectionString: connection.toString(), operation: ADMISSION_NODE_HOST.operation, ...(selectedMaximum !== undefined ? { maximumConnections: Number(selectedMaximum) } : {}) }));
  }
  return resources;
}
const owner = { userId: null, email: null };
const sampleMode = process.env[ADMISSION_SAMPLE.environmentVariable] === ADMISSION_SAMPLE.enabledValue;
/** @returns Its durable own result; no caller can select another operation. */
async function readStatus(): Promise<AdmissionNodeStatus> {
  const row = await database().withContext(owner, async (transaction) => (await transaction.execute<{ id: string; state: AdmissionNodeRunState; measurement: AdmissionNodeMeasurement | AdmissionNodeSample | null }>(sql`select id,state,measurement from native_test_support.admission_node_runs where id=${configuration.operationId} and expected_branch=${configuration.branchName}`)).rows.at(0));
  if (!row) throw new Error("AdmissionNodeHost.read failed: operation_unavailable");
  return sampleMode ? { operationId: row.id, state: row.state, measurement: null, sample: row.measurement as AdmissionNodeSample | null } : { operationId: row.id, state: row.state, measurement: row.measurement as AdmissionNodeMeasurement | null };
}
/** @returns The original persisted outcome; an already running invocation never starts another workload. */
async function run(): Promise<AdmissionNodeStatus> {
  const acquired = await database().withContext(owner, async (transaction) => (await transaction.execute(sql`update native_test_support.admission_node_runs set state=${ADMISSION_NODE_RUN_STATE.running},started_at=clock_timestamp() where id=${configuration.operationId} and expected_branch=${configuration.branchName} and state=${ADMISSION_NODE_RUN_STATE.prepared} returning id`)).rows.at(0));
  if (!acquired) return readStatus();
  try {
    const started = performance.now();
    const fixture = await seedAdmissionPerformanceFixture(database(), undefined, sampleMode ? ADMISSION_SAMPLE : ADMISSION_PERFORMANCE);
    await database().withContext(owner, (transaction) => transaction.execute(sql`update native_test_support.admission_node_runs set fixture_tribe_id=${fixture.fixture.tribeId} where id=${configuration.operationId} and state=${ADMISSION_NODE_RUN_STATE.running}`));
    const setupDurationMs = performance.now() - started;
    let measurement: AdmissionNodeMeasurement | AdmissionNodeSample;
    if (sampleMode) {
      measurement = admissionNodeSampleSchema.parse({ ...await runAdmissionSample(database(), fixture.fixture, fixture.participants), setupDurationMs, nodeVersion: process.versions.node, sourceCommit: configuration.sourceCommit, bundleSha256: configuration.bundleSha256 });
    } else {
    let cpuProfiler: Awaited<ReturnType<typeof startAdmissionCpuProfile>> | undefined;
    let cpuProfile: AdmissionCpuObservation | undefined;
    let measurementStartedAt: string | undefined, measurementFinishedAt: string | undefined;
    const measured = await (async () => {
      try { return await runAdmissionPerformanceWorkload(database(), fixture.fixture, fixture.participants, {
        beforeMeasurement: async () => {
          if (process.env[ADMISSION_CPU_PROFILE.environmentVariable] === ADMISSION_CPU_PROFILE.enabledValue) cpuProfiler = await startAdmissionCpuProfile();
          measurementStartedAt = new Date().toISOString();
        },
        afterMeasurement: async () => {
          measurementFinishedAt = new Date().toISOString();
          if (cpuProfiler) cpuProfile = await cpuProfiler.stop();
          cpuProfiler = undefined;
        },
        ...(process.env[ADMISSION_DATABASE_OBSERVATION.environmentVariable] === ADMISSION_DATABASE_OBSERVATION.enabledValue ? { observeDatabaseStatements: true } : {}),
      }); }
      finally { if (cpuProfiler) cpuProfile = await cpuProfiler.stop(); }
    })();
    measurement = admissionNodeMeasurementSchema.parse({ ...measured, ...(cpuProfile ? { cpuProfile } : {}), databaseConnection, measurementWindow: { startedAt: measurementStartedAt, finishedAt: measurementFinishedAt }, setupDurationMs, nodeVersion: process.versions.node, sourceCommit: configuration.sourceCommit, bundleSha256: configuration.bundleSha256 });
    }
    await database().withContext(owner, (transaction) => transaction.execute(sql`update native_test_support.admission_node_runs set state=${ADMISSION_NODE_RUN_STATE.completed},measurement=${JSON.stringify(measurement)}::jsonb,completed_at=clock_timestamp() where id=${configuration.operationId} and state=${ADMISSION_NODE_RUN_STATE.running}`));
  } catch (error) {
    try { await database().withContext(owner, (transaction) => transaction.execute(sql`update native_test_support.admission_node_runs set state=${ADMISSION_NODE_RUN_STATE.failed},completed_at=clock_timestamp() where id=${configuration.operationId} and state=${ADMISSION_NODE_RUN_STATE.running}`)); }
    catch (recordingError) { throw new AggregateError([error, recordingError], "AdmissionNodeHost.run failed: terminal_state_unconfirmed", { cause: error }); }
    throw new Error("AdmissionNodeHost.run failed: workload_unavailable", { cause: error });
  }
  return readStatus();
}
const handler = createAdmissionNodeHostHandler(configuration, {
  currentBranchName: () => process.env[ADMISSION_NODE_HOST.branchIdentityVariable], readStatus, run,
  reportFailure: (error) => logger.error({ message: "AdmissionNodeHost.request failed", metadata: { operationId: configuration.operationId, ...readPostgresTestDiagnostics(error) } }),
});
export default handler;
