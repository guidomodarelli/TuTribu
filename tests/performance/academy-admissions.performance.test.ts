/** @vitest-environment node */
/** Measures actual native confirmations and pool recovery; no provider delivery or human time is included. @module academy-admissions-performance-tests */
import { performance } from "node:perf_hooks";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionPerformanceFixture } from "@/tests/support/admission-performance-fixture";
import { runAdmissionPerformanceWorkload } from "@/tests/support/run-admission-performance-workload";
import { ADMISSION_PERFORMANCE, ADMISSION_PERFORMANCE_ENVIRONMENT, ADMISSION_PERFORMANCE_PHASE, ADMISSION_PERFORMANCE_CASE } from "@/tests/support/constants/admission-performance";
import { IDLE_IN_TRANSACTION_TIMEOUT_MILLISECONDS } from "@/src/modules/shared/infrastructure/database/postgres-pool";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_PERFORMANCE_TESTS !== "1")("native admission performance", () => {
  // The report matches results by these exact case titles; `%s` renders the shared name unchanged.
  it.each([ADMISSION_PERFORMANCE_CASE.load])("%s", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const setupStartedAt = performance.now();
      const { fixture, participants } = await prepareAdmissionPerformanceFixture(database, (phase) => process.stdout.write(JSON.stringify({ phase }) + "\n"));
      const setupDurationMs = performance.now() - setupStartedAt;
      const measurement = await runAdmissionPerformanceWorkload(database, fixture, participants);
      process.stdout.write(JSON.stringify({ phase: ADMISSION_PERFORMANCE_PHASE.measurement, setupDurationMs, ...measurement }) + "\n");
      expect(measurement.failures).toEqual([]);
      expect({ admitted: measurement.admitted, pending: measurement.pending }).toEqual({ admitted: ADMISSION_PERFORMANCE.enabledParticipantCount, pending: ADMISSION_PERFORMANCE.participantCount - ADMISSION_PERFORMANCE.enabledParticipantCount });
      expect(measurement.facts).toEqual({ entries: ADMISSION_PERFORMANCE.entryCount, requests: ADMISSION_PERFORMANCE.participantCount, basic_members: ADMISSION_PERFORMANCE.enabledParticipantCount, deliveries: 0 });
      expect(measurement.peakInFlight).toBe(ADMISSION_PERFORMANCE.participantCount);
      expect(measurement.pool.waitingAfter).toBe(0); expect(measurement.pool.checkedOutAfter).toBe(0);
      expect(measurement.pool.acquisitions).toBe(measurement.pool.releases);
      expect(measurement.p95Ms).not.toBeNull(); expect(measurement.p95Ms!).toBeLessThan(ADMISSION_PERFORMANCE.confirmationBudgetMs);
    }, { authorization: process.env[ADMISSION_PERFORMANCE_ENVIRONMENT.authorization], ownershipNonce: process.env[ADMISSION_PERFORMANCE_ENVIRONMENT.loadBranchNonce] });
  }, ADMISSION_PERFORMANCE.nativeCaseTimeoutMs);

  it.each([ADMISSION_PERFORMANCE_CASE.abandonment])("%s", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const before = database.readPoolMetrics();
      let entered = false, observedIdleTimeoutMs: number | null = null;
      let allowCompletion: () => void = () => undefined;
      const pendingWork = new Promise<void>((resolve) => { allowCompletion = resolve; });
      const original = database.withContext({ userId: null, email: null }, async (transaction) => {
        const row = (await transaction.execute<{ idle_timeout_ms: string | number }>(sql`select extract(epoch from current_setting('idle_in_transaction_session_timeout')::interval)*1000 as idle_timeout_ms`)).rows[0];
        observedIdleTimeoutMs = Number(row.idle_timeout_ms);
        entered = true;
        await pendingWork;
      }).then(() => ({ committed: true }), (error: unknown) => ({ committed: false, cause: error }));
      let healthy: number | null;
      const observedAt = performance.now();
      try {
        await expect.poll(() => entered, { timeout: ADMISSION_PERFORMANCE.abandonmentObservationMs }).toBe(true);
        expect(observedIdleTimeoutMs).toBe(IDLE_IN_TRANSACTION_TIMEOUT_MILLISECONDS);
        await expect.poll(() => database.readPoolMetrics().errorReleases, { timeout: ADMISSION_PERFORMANCE.abandonmentObservationMs }).toBeGreaterThan(before.errorReleases);
        expect(database.readPoolMetrics().lastErrorRelease?.sqlStates).toContain("25P03");
        healthy = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ healthy: number }>(sql`select 1::integer as healthy`)).rows[0].healthy);
      } finally { allowCompletion(); }
      expect(await original).toMatchObject({ committed: false });
      const after = database.readPoolMetrics();
      process.stdout.write(JSON.stringify({ phase: ADMISSION_PERFORMANCE_PHASE.abandonment, observedIdleTimeoutMs, observationDurationMs: performance.now() - observedAt, healthy, maximum: after.maximum, errorReleases: after.errorReleases - before.errorReleases, lastErrorRelease: after.lastErrorRelease, acquisitions: after.acquisitions - before.acquisitions, releases: after.releases - before.releases, waitingAfter: after.waitingCount, checkedOutAfter: after.totalCount - after.idleCount }) + "\n");
      expect(healthy).toBe(1); expect(after.maximum).toBe(1);
      expect(after.errorReleases - before.errorReleases).toBe(1);
      expect(after.acquisitions - before.acquisitions).toBe(after.releases - before.releases);
      expect(after.waitingCount).toBe(0); expect(after.totalCount).toBe(after.idleCount);
    }, { concurrentTransactions: 1, authorization: process.env[ADMISSION_PERFORMANCE_ENVIRONMENT.authorization], ownershipNonce: process.env[ADMISSION_PERFORMANCE_ENVIRONMENT.abandonmentBranchNonce] });
  }, ADMISSION_PERFORMANCE.abandonmentCaseTimeoutMs);
});
