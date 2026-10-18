/** @vitest-environment node */
/** Exercises the same real application workload on authenticated branch-scoped Node compute. */
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { executeAdmissionMigrationCommand } from "@/tests/support/admission-migration-command";
import { deployAdmissionNodeHost, type AdmissionNodeDeployment } from "@/tests/support/admission-node-deployment";
import { ADMISSION_NODE_HOST, ADMISSION_NODE_RUN_STATE, admissionNodeStatusSchema } from "@/tests/support/constants/admission-node-host";
import { ADMISSION_PERFORMANCE } from "@/tests/support/constants/admission-performance";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { inspectAdmissionDatabaseStatements } from "@/tests/support/admission-statement-inspection";
import { ADMISSION_STATEMENT_PROFILE } from "@/tests/support/constants/admission-statement-profile";
import { ADMISSION_CPU_PROFILE } from "@/tests/support/constants/admission-cpu-profile";
import { ADMISSION_DATABASE_OBSERVATION } from "@/tests/support/constants/admission-database-observation";

describe.skipIf(process.env.RUN_ADMISSION_NODE_HOST_TESTS !== "1")("colocated native admission workload", () => {
  it("should retain the full hundred-account workload, its original result and the unchanged latency gate", async () => {
    let observed: unknown;
    const computeUnits = Number(process.env[ADMISSION_NODE_HOST.computeUnitsVariable] ?? ADMISSION_NODE_HOST.computeUnits);
    await withAcademyAdmissionDatabase(async (database) => {
      await database.withServerEnvironment((environment) => executeAdmissionMigrationCommand({ ...environment, DATABASE_MIGRATION_URL: environment.DATABASE_URL }));
      const operationId = randomUUID(), token = randomBytes(ADMISSION_NODE_HOST.tokenBytes).toString("base64url");
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        await transaction.execute(sql`create extension if not exists pg_stat_statements`);
        await transaction.execute(sql.raw(await readFile(join(process.cwd(), "tests/support/sql/20261018053000_create_admission_node_probe.sql"), "utf8")));
        await transaction.execute(sql`insert into native_test_support.admission_node_runs(id,expected_branch) values (${operationId},${database.branch.name})`);
      });
      const databaseStatistics = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ trackingMode: string; planningEnabled: boolean; serverVersionNum: number }>(sql`select current_setting(${ADMISSION_STATEMENT_PROFILE.trackingSetting}) as "trackingMode",current_setting(${ADMISSION_STATEMENT_PROFILE.planningSetting})='on' as "planningEnabled",current_setting(${ADMISSION_STATEMENT_PROFILE.versionSetting})::integer as "serverVersionNum"`)).rows[0]);
      let deployment: AdmissionNodeDeployment | undefined;
      try {
        deployment = await deployAdmissionNodeHost(database.branch, operationId, createHash("sha256").update(token).digest("hex"), computeUnits);
        const url = (path: string) => new URL(path, deployment!.url);
        const denied = await fetch(url(ADMISSION_NODE_HOST.runPath), { method: "POST", redirect: "manual", signal: AbortSignal.timeout(ADMISSION_NODE_HOST.requestTimeoutMs) });
        expect(denied.status).toBe(HTTP_STATUS.unauthorized);
        const headers = { authorization: `${ADMISSION_NODE_HOST.tokenPrefix}${token}` };
        const before = await fetch(url(ADMISSION_NODE_HOST.statusPath), { headers, redirect: "manual", signal: AbortSignal.timeout(ADMISSION_NODE_HOST.requestTimeoutMs) });
        expect(admissionNodeStatusSchema.parse(await before.json()).state).toBe(ADMISSION_NODE_RUN_STATE.prepared);
        const response = await fetch(url(ADMISSION_NODE_HOST.runPath), { method: "POST", headers, redirect: "manual", signal: AbortSignal.timeout(ADMISSION_NODE_HOST.requestTimeoutMs) });
        expect(response.status).toBe(HTTP_STATUS.ok);
        const result = admissionNodeStatusSchema.parse(await response.json());
        observed = { operationId, sourceCommit: deployment.sourceCommit, bundleSha256: deployment.bundleSha256, compute: deployment.compute, databaseStatistics, result };
        if (process.env.ADMISSION_NODE_REPORT_FILE) await writeFile(process.env.ADMISSION_NODE_REPORT_FILE, JSON.stringify(observed, null, 2));
        const databaseProfile = await inspectAdmissionDatabaseStatements(database);
        observed = { ...(observed as Record<string, unknown>), databaseProfile };
        if (process.env.ADMISSION_NODE_REPORT_FILE) await writeFile(process.env.ADMISSION_NODE_REPORT_FILE, JSON.stringify(observed, null, 2));
        expect(databaseProfile.status).toBe(ADMISSION_STATEMENT_PROFILE.availableStatus);
        if (databaseProfile.status === ADMISSION_STATEMENT_PROFILE.availableStatus) expect(databaseProfile.statements.length).toBeGreaterThan(0);
        expect(result.state).toBe(ADMISSION_NODE_RUN_STATE.completed);
        const measured = result.measurement;
        expect(measured).not.toBeNull();
        if (!measured) throw new Error("AdmissionNodeHost.test failed: measurement_unavailable");
        if (process.env[ADMISSION_CPU_PROFILE.environmentVariable] === ADMISSION_CPU_PROFILE.enabledValue) {
          expect(measured.cpuProfile?.status).toBe("available");
          if (measured.cpuProfile?.status === "available") { expect(measured.cpuProfile.sampleCount).toBeGreaterThan(0); expect(measured.cpuProfile.topSelf.length).toBeGreaterThan(0); }
        }
        expect(measured.sourceCommit).toBe(deployment.sourceCommit); expect(measured.bundleSha256).toBe(deployment.bundleSha256);
        expect(measured.nodeVersion).toMatch(ADMISSION_NODE_HOST.nodeVersionPattern);
        if (process.env[ADMISSION_DATABASE_OBSERVATION.environmentVariable] === ADMISSION_DATABASE_OBSERVATION.enabledValue) {
          const observations = measured.diagnostics.databaseObservations;
          expect(observations?.account.transactions).toBe(measured.diagnostics.accountTransactions);
          expect(observations?.command.transactions).toBe(measured.diagnostics.commandTransactions);
          if (!observations) throw new Error("Admission database observation failed: native_measurement_unavailable");
          for (const observation of [observations.account, observations.command]) {
            expect(observation.transactions).toBeGreaterThan(0);
            expect(observation.statementCount).toBeGreaterThanOrEqual(observation.transactions);
            expect(observation.pendingStatements).toBe(0);
            expect(observation.observedAwaitP95Ms).toBeGreaterThan(0);
            expect(observation.observedAwaitP95Ms!).toBeLessThanOrEqual(observation.elapsedP95Ms!);
            expect(observation.unobservedP95Ms!).toBeLessThanOrEqual(observation.elapsedP95Ms!);
          }
        } else expect(measured.diagnostics.databaseObservations).toBeUndefined();
        expect(measured.failures).toEqual([]);
        expect({ participants: measured.participants, admitted: measured.admitted, pending: measured.pending }).toEqual({ participants: ADMISSION_PERFORMANCE.participantCount, admitted: ADMISSION_PERFORMANCE.enabledParticipantCount, pending: ADMISSION_PERFORMANCE.participantCount - ADMISSION_PERFORMANCE.enabledParticipantCount });
        expect(measured.facts).toEqual({ entries: ADMISSION_PERFORMANCE.entryCount, requests: ADMISSION_PERFORMANCE.participantCount, basic_members: ADMISSION_PERFORMANCE.enabledParticipantCount, deliveries: 0 });
        expect(measured.peakInFlight).toBe(ADMISSION_PERFORMANCE.participantCount); expect(measured.pool.waitingAfter).toBe(0); expect(measured.pool.checkedOutAfter).toBe(0); expect(measured.pool.acquisitions).toBe(measured.pool.releases);
        const replay = await fetch(url(ADMISSION_NODE_HOST.runPath), { method: "POST", headers, redirect: "manual", signal: AbortSignal.timeout(ADMISSION_NODE_HOST.requestTimeoutMs) });
        expect(admissionNodeStatusSchema.parse(await replay.json())).toEqual(result);
        const stock = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ requests: number }>(sql`select count(*)::int as requests from public.academy_admission_requests where tribe_id=(select fixture_tribe_id from native_test_support.admission_node_runs where id=${operationId})`)).rows[0]);
        expect(stock.requests).toBe(ADMISSION_PERFORMANCE.participantCount);
        expect(measured.p95Ms).not.toBeNull(); expect(measured.p95Ms!).toBeLessThan(ADMISSION_PERFORMANCE.confirmationBudgetMs);
      } finally { await deployment?.remove(); }
    }, { computeUnits });
    if (process.env.ADMISSION_NODE_REPORT_FILE && observed) await writeFile(process.env.ADMISSION_NODE_REPORT_FILE, JSON.stringify({ ...(observed as Record<string, unknown>), resourcesRemoved: true }, null, 2));
  }, ADMISSION_NODE_HOST.nativeCaseTimeoutMs);
});
