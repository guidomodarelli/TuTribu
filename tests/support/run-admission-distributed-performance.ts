/** Owns one original hundred-account cohort from branch preparation through confirmed retirement. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { createAdmissionSyntheticHostingEnvironment } from "./admission-synthetic-hosting-environment";
import { prepareAdmissionPerformanceFixture } from "./admission-performance-fixture";
import { deployAdmissionDistributedNodes, type AdmissionDistributedNodeDeployment } from "./admission-distributed-node-deployment";
import { summarizeAdmissionDistributedPerformance } from "./summarize-admission-distributed-performance";
import { ADMISSION_PERFORMANCE } from "./constants/admission-performance";
import { ADMISSION_NODE_HOST, ADMISSION_NODE_RUN_STATE, admissionNodeStatusSchema, type AdmissionNodeRunState, type AdmissionNodeStatus } from "./constants/admission-node-host";
import { ADMISSION_DISTRIBUTED_NODE, type AdmissionDistributedNodeMeasurement, type AdmissionDistributedHostInput } from "./constants/admission-distributed-node";

type AdmissionDistributedFacts = { entries: number; requests: number; basic_members: number; deliveries: number };
type AdmissionDistributedStoredNode = { node_index: number; state: AdmissionNodeRunState; measurement: AdmissionDistributedNodeMeasurement | null };
type AdmissionDistributedHostRequest = { nodeIndex: number; phase: string; status: number; durationMs: number };
/** Contains generated resource IDs and safe measurements only, never the private deployment input. */
export type AdmissionDistributedPerformanceObservation = {
  operationId: string; startedAt: string; passed: boolean;
  branch?: AcademyAdmissionTestDatabase["branch"];
  sourceCommit?: string; bundleSha256?: string; compilerVersion?: string;
  sourceInputs?: AdmissionDistributedNodeDeployment["sourceInputs"];
  compute?: AdmissionDistributedNodeDeployment["compute"];
  functionSlugs?: string[];
  managementAndBranchPreparationDurationMs?: number;
  fixtureAndMigrationsDurationMs?: number;
  deploymentAndMetadataDurationMs?: number;
  hostPreflightDurationMs?: number;
  hostRequests: AdmissionDistributedHostRequest[];
  failedHostRequests?: number;
  measurement?: ReturnType<typeof summarizeAdmissionDistributedPerformance> & { facts: AdmissionDistributedFacts };
  stockAndReplayPreserved?: boolean;
  separateExcludedStagesMeasured?: boolean;
  privateMaterialAbsentFromOwnFiles?: boolean;
  inputsStable?: boolean;
  correctnessPassed?: boolean;
  functionsRemoved?: boolean;
  branchRemoved?: boolean;
};

/**
 * Runs the real Node workload once; an uncertain HTTP response is never automatically re-posted.
 * @param options - Explicit native capacity and optional safe report destination/progress observer.
 * @returns Original samples and cleanup confirmations after the exact owned branch is absent.
 * @throws On transport, correctness, overlap, pool, latency or cleanup failure, preserving measurements.
 */
export async function runAdmissionDistributedPerformance(options: { computeUnits: number; reportFile?: string; onPhase?: (phase: string) => void }): Promise<AdmissionDistributedPerformanceObservation> {
  const started = performance.now();
  const report: AdmissionDistributedPerformanceObservation = { operationId: randomUUID(), startedAt: new Date().toISOString(), passed: false, hostRequests: [] };
  const persist = async () => { if (options.reportFile) await writeFile(options.reportFile, JSON.stringify(report, null, 2)); };
  let workFailure: unknown;
  try {
    await withAcademyAdmissionDatabase(async (database) => {
      report.managementAndBranchPreparationDurationMs = performance.now() - started;
      report.branch = database.branch;
      await persist();
      let deployment: AdmissionDistributedNodeDeployment | undefined;
      try {
        options.onPhase?.("distributed_fixture_preparation");
        const fixtureStarted = performance.now();
        const environment = createAdmissionSyntheticHostingEnvironment();
        const security = await readMessagingHostingSecurityConfig(environment);
        const { fixture, participants } = await prepareAdmissionPerformanceFixture(database, options.onPhase, ADMISSION_PERFORMANCE, security);
        await database.withContext({ userId: null, email: null }, async (transaction) => {
          await transaction.execute(sql.raw(await readFile(join(process.cwd(), ADMISSION_DISTRIBUTED_NODE.supportMigration), "utf8")));
          await transaction.execute(sql`insert into native_test_support.admission_distributed_cohorts(id,expected_branch,tribe_id,node_count) values (${report.operationId},${database.branch.name},${fixture.tribeId},${ADMISSION_DISTRIBUTED_NODE.functionCount})`);
          for (let nodeIndex = 0; nodeIndex < ADMISSION_DISTRIBUTED_NODE.functionCount; nodeIndex += 1) await transaction.execute(sql`insert into native_test_support.admission_distributed_nodes(cohort_id,node_index) values (${report.operationId},${nodeIndex})`);
        });
        report.fixtureAndMigrationsDurationMs = performance.now() - fixtureStarted;
        const inputs: AdmissionDistributedHostInput[] = Array.from({ length: ADMISSION_DISTRIBUTED_NODE.functionCount }, (_, nodeIndex) => ({ nodeIndex, tribeId: fixture.tribeId, leaderUserId: fixture.own.userId, leaderEmail: fixture.own.email, participants: participants.filter((participant) => participant.index % ADMISSION_DISTRIBUTED_NODE.functionCount === nodeIndex).map(({ index, userId, sessionId, email }) => ({ index, userId, sessionId, email })) }));
        const token = randomBytes(ADMISSION_NODE_HOST.tokenBytes).toString("base64url");
        options.onPhase?.("distributed_deployment");
        const deploymentStarted = performance.now();
        deployment = await deployAdmissionDistributedNodes(database.branch, report.operationId, token, environment, inputs, options.computeUnits);
        report.deploymentAndMetadataDurationMs = performance.now() - deploymentStarted;
        Object.assign(report, { sourceCommit: deployment.sourceCommit, bundleSha256: deployment.bundleSha256, compilerVersion: deployment.compilerVersion, sourceInputs: deployment.sourceInputs, compute: deployment.compute, functionSlugs: deployment.hosts.map((host) => host.slug) });
        const headers = { authorization: `${ADMISSION_NODE_HOST.tokenPrefix}${token}` };
        /** Records only HTTP metadata, excluding authorization, response bodies and private actor partitions. */
        async function request(host: AdmissionDistributedNodeDeployment["hosts"][number], path: string, method: string, phase: string, authenticated = true) {
          const requestStarted = performance.now();
          const response = await fetch(new URL(path, host.url), { method, ...(authenticated ? { headers } : {}), redirect: "manual", signal: AbortSignal.timeout(ADMISSION_NODE_HOST.requestTimeoutMs) });
          report.hostRequests.push({ nodeIndex: host.nodeIndex, phase, status: response.status, durationMs: performance.now() - requestStarted });
          return response;
        }
        options.onPhase?.("distributed_host_preflight");
        const preflightStarted = performance.now();
        for (const host of deployment.hosts) {
          assert.equal((await request(host, ADMISSION_NODE_HOST.runPath, "POST", "anonymous", false)).status, HTTP_STATUS.unauthorized);
          const before = await request(host, ADMISSION_NODE_HOST.statusPath, "GET", "prepared");
          assert.equal(before.status, HTTP_STATUS.ok);
          assert.deepEqual(admissionNodeStatusSchema.parse(await before.json()), { operationId: report.operationId, state: ADMISSION_NODE_RUN_STATE.prepared, measurement: null });
        }
        report.hostPreflightDurationMs = performance.now() - preflightStarted;
        await persist();
        options.onPhase?.("distributed_original_workload");
        const replies = await Promise.allSettled(deployment.hosts.map(async (host): Promise<AdmissionNodeStatus> => {
          const response = await request(host, ADMISSION_NODE_HOST.runPath, "POST", "workload");
          assert.equal(response.status, HTTP_STATUS.ok);
          return admissionNodeStatusSchema.parse(await response.json());
        }));
        report.failedHostRequests = replies.filter((reply) => reply.status === "rejected").length;
        await persist();
        assert.equal(report.failedHostRequests, 0, "Distributed admission original HTTP responses must all be known");
        const results = replies.map((reply) => { assert.equal(reply.status, "fulfilled"); return reply.value; });
        for (const result of results) assert.deepEqual(result, { operationId: report.operationId, state: ADMISSION_NODE_RUN_STATE.completed, measurement: null });
        /** SQL rows are trusted adapter output; only public HTTP DTOs are schema-validated here. */
        const readNodes = () => database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<AdmissionDistributedStoredNode>(sql`select node_index,state,measurement from native_test_support.admission_distributed_nodes where cohort_id=${report.operationId} order by node_index`)).rows);
        const stored = await readNodes();
        assert.equal(stored.length, ADMISSION_DISTRIBUTED_NODE.functionCount);
        const nodes = stored.map((node) => { assert.equal(node.state, ADMISSION_NODE_RUN_STATE.completed); assert.ok(node.measurement); assert.equal(node.node_index, node.measurement.nodeIndex); return node.measurement; });
        const facts = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<AdmissionDistributedFacts>(sql`select (select count(*)::integer from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}) as entries,(select count(*)::integer from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests,(select count(*)::integer from public.tribe_members where tribe_id=${fixture.tribeId} and role=${TRIBE_MEMBER_ROLE.tribemate} and status=${TRIBE_MEMBERSHIP_STATUS.active}) as basic_members,(select count(*)::integer from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries`)).rows[0]);
        report.measurement = { ...summarizeAdmissionDistributedPerformance(nodes), facts };
        await persist();
        const measured = report.measurement;
        assert.deepEqual(measured.failures, []);
        assert.equal(measured.admitted, ADMISSION_PERFORMANCE.enabledParticipantCount);
        assert.equal(measured.pending, ADMISSION_PERFORMANCE.participantCount - ADMISSION_PERFORMANCE.enabledParticipantCount);
        assert.deepEqual(facts, { entries: ADMISSION_PERFORMANCE.entryCount, requests: ADMISSION_PERFORMANCE.participantCount, basic_members: ADMISSION_PERFORMANCE.enabledParticipantCount, deliveries: 0 });
        assert.equal(measured.guaranteedHundredOverlap, true);
        for (const node of nodes) {
          assert.equal(node.sourceCommit, deployment.sourceCommit); assert.equal(node.bundleSha256, deployment.bundleSha256);
          assert.match(node.nodeVersion, ADMISSION_NODE_HOST.nodeVersionPattern);
          assert.equal(node.peakInFlight, ADMISSION_DISTRIBUTED_NODE.poolMaximum);
          assert.equal(node.pool.maximum, ADMISSION_DISTRIBUTED_NODE.poolMaximum);
          assert.equal(node.pool.acquisitions, node.participants * ADMISSION_DISTRIBUTED_NODE.transactionsPerParticipant);
          assert.equal(node.pool.acquisitions, node.pool.releases); assert.equal(node.pool.errorReleases, 0);
          assert.equal(node.pool.peakWaitingCount, 0); assert.equal(node.pool.waitingAfter, 0); assert.equal(node.pool.checkedOutAfter, 0);
          assert.equal(node.networkSamples, ADMISSION_PERFORMANCE.networkSampleCount);
          assert.ok(node.networkQueryP95Ms !== null && node.networkQueryP95Ms > 0);
          for (const duration of [node.configurationDurationMs, node.warmupDurationMs, node.barrierDurationMs]) assert.ok(Number.isFinite(duration) && duration > 0);
        }
        report.separateExcludedStagesMeasured = true;
        for (const host of deployment.hosts) {
          const replay = await request(host, ADMISSION_NODE_HOST.runPath, "POST", "replay");
          assert.equal(replay.status, HTTP_STATUS.ok);
          assert.deepEqual(admissionNodeStatusSchema.parse(await replay.json()), results[host.nodeIndex]);
        }
        assert.deepEqual(await readNodes(), stored, "Replay must preserve every original duration and result, not only lifecycle state");
        const stock = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ requests: number }>(sql`select count(*)::integer as requests from public.academy_admission_requests where tribe_id=${fixture.tribeId}`)).rows[0]);
        assert.equal(stock.requests, ADMISSION_PERFORMANCE.participantCount);
        report.stockAndReplayPreserved = true;
        await deployment.assertInputsUnchanged(); report.inputsStable = true;
        await deployment.assertPrivateMaterialAbsent(); report.privateMaterialAbsentFromOwnFiles = true;
        report.correctnessPassed = true;
        await persist();
        assert.ok(measured.p95Ms !== null && measured.p95Ms < ADMISSION_PERFORMANCE.confirmationBudgetMs, "Original global confirmation p95 must remain below three seconds");
      } catch (error) { workFailure = error; }
      finally {
        try { if (deployment) { await deployment.remove(); report.functionsRemoved = true; } }
        catch (cleanupError) { workFailure = workFailure ? new AggregateError([workFailure, cleanupError], "AdmissionDistributedPerformance.run failed: function_cleanup_unconfirmed", { cause: workFailure }) : cleanupError; }
        await persist();
      }
    }, { computeUnits: options.computeUnits, concurrentTransactions: ADMISSION_PERFORMANCE.participantCount, databaseSelection: { roleName: "neondb_owner", databaseName: "neondb" } });
    report.branchRemoved = true;
    if (workFailure) throw workFailure;
    report.passed = true;
    return report;
  } finally { await persist(); }
}
