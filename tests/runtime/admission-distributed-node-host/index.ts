/** Runs one immutable actor partition behind the existing authenticated native-host boundary. */
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { createAdmissionPerformanceDatabase } from "@/tests/support/admission-performance-database";
import { createAdmissionNodeHostHandler } from "@/tests/support/admission-node-host-handler";
import { runAdmissionPerformanceWorkload } from "@/tests/support/run-admission-performance-workload";
import { ADMISSION_NODE_HOST, ADMISSION_NODE_RUN_STATE, admissionNodeConfigurationSchema, type AdmissionNodeStatus, type AdmissionNodeRunState } from "@/tests/support/constants/admission-node-host";
import { ADMISSION_DISTRIBUTED_NODE, admissionDistributedHostInputSchema, admissionDistributedNodeMeasurementSchema, type AdmissionDistributedNodeMeasurement } from "@/tests/support/constants/admission-distributed-node";
import { readPostgresTestDiagnostics } from "@/tests/support/postgres-test-diagnostics";

const configuration = admissionNodeConfigurationSchema.parse({ branchName: process.env[ADMISSION_NODE_HOST.branchVariable], operationId: process.env[ADMISSION_NODE_HOST.operationVariable], tokenSha256: process.env[ADMISSION_NODE_HOST.tokenDigestVariable], expiresAt: process.env[ADMISSION_NODE_HOST.expiresVariable], sourceCommit: process.env[ADMISSION_NODE_HOST.sourceCommitVariable], bundleSha256: process.env[ADMISSION_NODE_HOST.bundleDigestVariable] });
const input = admissionDistributedHostInputSchema.parse(JSON.parse(process.env[ADMISSION_DISTRIBUTED_NODE.privateInputVariable] ?? ""));
const logger = createServerLogger({ feature: ADMISSION_DISTRIBUTED_NODE.operation, operation: ADMISSION_DISTRIBUTED_NODE.operation, requestId: configuration.operationId });
const owner = { userId: null, email: null };
let resources: ReturnType<typeof createAdmissionPerformanceDatabase> | undefined;

/** @returns A lazy owned-branch pool; anonymous requests never invoke this adapter. */
function database() {
  if (!resources) {
    const value = process.env[ADMISSION_NODE_HOST.directDatabaseVariable] ?? process.env[ADMISSION_NODE_HOST.databaseVariable];
    if (!value) throw new Error("AdmissionDistributedHost.database failed: injected_connection_unavailable");
    const connection = new URL(value);
    connection.searchParams.set("sslmode", "verify-full");
    connection.searchParams.set("application_name", configuration.operationId);
    resources = createAdmissionPerformanceDatabase(createPostgresPool({ connectionString: connection.toString(), maximumConnections: ADMISSION_DISTRIBUTED_NODE.poolMaximum, operation: ADMISSION_DISTRIBUTED_NODE.operation }));
  }
  return resources;
}

/** @returns Only lifecycle state over HTTP; the owner reads safe measurement rows separately. */
async function readStatus(): Promise<AdmissionNodeStatus> {
  const row = await database().withContext(owner, async (transaction) => (await transaction.execute<{ state: AdmissionNodeRunState }>(sql`select node.state from native_test_support.admission_distributed_nodes node join native_test_support.admission_distributed_cohorts cohort on cohort.id=node.cohort_id where node.cohort_id=${configuration.operationId} and node.node_index=${input.nodeIndex} and cohort.expected_branch=${configuration.branchName} and cohort.tribe_id=${input.tribeId}`)).rows.at(0));
  if (!row) throw new Error("AdmissionDistributedHost.read failed: owned_operation_unavailable");
  return { operationId: configuration.operationId, state: row.state, measurement: null };
}

/** @returns The original durable lifecycle result; replay never runs a second actor workload. */
async function run(): Promise<AdmissionNodeStatus> {
  const acquired = await database().withContext(owner, async (transaction) => (await transaction.execute(sql`update native_test_support.admission_distributed_nodes node set state=${ADMISSION_NODE_RUN_STATE.running} where node.cohort_id=${configuration.operationId} and node.node_index=${input.nodeIndex} and node.state=${ADMISSION_NODE_RUN_STATE.prepared} and exists(select 1 from native_test_support.admission_distributed_cohorts cohort where cohort.id=node.cohort_id and cohort.expected_branch=${configuration.branchName} and cohort.tribe_id=${input.tribeId}) returning node.node_index`)).rows.at(0));
  if (!acquired) return readStatus();
  try {
    const configurationStarted = performance.now();
    const security = await readMessagingHostingSecurityConfig();
    const configurationDurationMs = performance.now() - configurationStarted;
    let anchor: { serverMs: number; localBefore: number; localAfter: number } | undefined;
    let barrierDurationMs: number | undefined;
    let confirmations: AdmissionDistributedNodeMeasurement["confirmations"] = [];
    const measured = await runAdmissionPerformanceWorkload(database(), { tribeId: input.tribeId, own: { userId: input.leaderUserId, email: input.leaderEmail }, config: security }, input.participants, {
      beforeMeasurement: async () => {
        const barrierStarted = performance.now();
        await database().withContext(owner, (transaction) => transaction.execute(sql`update native_test_support.admission_distributed_nodes set ready_at=clock_timestamp() where cohort_id=${configuration.operationId} and node_index=${input.nodeIndex} and state=${ADMISSION_NODE_RUN_STATE.running}`));
        const deadline = performance.now() + ADMISSION_DISTRIBUTED_NODE.barrierTimeoutMs;
        while (performance.now() < deadline) {
          await database().withContext(owner, (transaction) => transaction.execute(sql`update native_test_support.admission_distributed_cohorts set release_at=clock_timestamp()+${ADMISSION_DISTRIBUTED_NODE.barrierReleaseDelayMs}*interval '1 millisecond' where id=${configuration.operationId} and release_at is null and (select count(*) from native_test_support.admission_distributed_nodes where cohort_id=${configuration.operationId} and ready_at is not null)=${ADMISSION_DISTRIBUTED_NODE.functionCount}`));
          const localBefore = performance.now();
          const current = await database().withContext(owner, async (transaction) => (await transaction.execute<{ released: boolean; server_ms: string }>(sql`select release_at<=clock_timestamp() as released,extract(epoch from clock_timestamp())*1000 as server_ms from native_test_support.admission_distributed_cohorts where id=${configuration.operationId}`)).rows[0]);
          const localAfter = performance.now();
          if (current.released) { anchor = { serverMs: Number(current.server_ms), localBefore, localAfter }; barrierDurationMs = localAfter - barrierStarted; return; }
          await delay(ADMISSION_DISTRIBUTED_NODE.barrierPollIntervalMs);
        }
        throw new Error("AdmissionDistributedHost.barrier failed: owned_cohort_not_ready");
      },
      observeConfirmations: (observed, measurementStartedAt) => {
        if (!anchor) throw new Error("AdmissionDistributedHost.observe failed: server_clock_anchor_unavailable");
        const clock = anchor;
        confirmations = observed.map((confirmation) => {
          const localStart = measurementStartedAt + confirmation.startedOffsetMs;
          return { ...confirmation, startedLowerMs: clock.serverMs + localStart - clock.localAfter, startedUpperMs: clock.serverMs + localStart - clock.localBefore, finishedLowerMs: clock.serverMs + localStart + confirmation.durationMs - clock.localAfter, finishedUpperMs: clock.serverMs + localStart + confirmation.durationMs - clock.localBefore };
        });
      },
    });
    if (!anchor) throw new Error("AdmissionDistributedHost.complete failed: server_clock_anchor_unavailable");
    const measurement = admissionDistributedNodeMeasurementSchema.parse({ nodeIndex: input.nodeIndex, nodeVersion: process.versions.node, sourceCommit: configuration.sourceCommit, bundleSha256: configuration.bundleSha256, participants: measured.participants, admitted: measured.admitted, pending: measured.pending, p95Ms: measured.p95Ms, peakInFlight: measured.peakInFlight, pool: measured.pool, confirmations, clockBracketMs: anchor.localAfter - anchor.localBefore, wallDurationMs: measured.diagnostics.wallDurationMs, eventLoopP95Ms: measured.eventLoopP95Ms, configurationDurationMs, warmupDurationMs: measured.warmupDurationMs, barrierDurationMs, networkQueryP95Ms: measured.networkQueryP95Ms, networkSamples: measured.networkSamples, realMessages: 0 });
    await database().withContext(owner, (transaction) => transaction.execute(sql`update native_test_support.admission_distributed_nodes set state=${ADMISSION_NODE_RUN_STATE.completed},measurement=${JSON.stringify(measurement)}::jsonb where cohort_id=${configuration.operationId} and node_index=${input.nodeIndex} and state=${ADMISSION_NODE_RUN_STATE.running}`));
  } catch (error) {
    try { await database().withContext(owner, (transaction) => transaction.execute(sql`update native_test_support.admission_distributed_nodes set state=${ADMISSION_NODE_RUN_STATE.failed} where cohort_id=${configuration.operationId} and node_index=${input.nodeIndex} and state=${ADMISSION_NODE_RUN_STATE.running}`)); }
    catch (recordingError) { throw new AggregateError([error, recordingError], "AdmissionDistributedHost.run failed: terminal_state_unconfirmed", { cause: error }); }
    throw new Error("AdmissionDistributedHost.run failed: workload_unavailable", { cause: error });
  }
  return readStatus();
}

const handler = createAdmissionNodeHostHandler(configuration, {
  currentBranchName: () => process.env[ADMISSION_NODE_HOST.branchIdentityVariable], readStatus, run,
  reportFailure: (error) => logger.error({ message: "AdmissionDistributedHost.request failed", metadata: { operationId: configuration.operationId, nodeIndex: input.nodeIndex, ...readPostgresTestDiagnostics(error) } }),
});
export default handler;
