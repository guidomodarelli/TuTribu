/** @vitest-environment node */
/** Measures actual native confirmations and pool recovery; no provider delivery or human time is included. @module academy-admissions-performance-tests */
import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionPerformanceFixture } from "@/tests/support/admission-performance-fixture";
import { ADMISSION_PERFORMANCE, ADMISSION_PERFORMANCE_ENVIRONMENT, ADMISSION_PERFORMANCE_FAILURE, ADMISSION_PERFORMANCE_PHASE, ADMISSION_PERFORMANCE_CASE } from "@/tests/support/constants/admission-performance";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { ADMISSION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { IDLE_IN_TRANSACTION_TIMEOUT_MILLISECONDS } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import { readPostgresTestDiagnostics } from "@/tests/support/postgres-test-diagnostics";

/** @param durations - All original call durations, including failures. @returns The configured nearest-rank percentile, or null when no observation exists. */
function confirmationPercentile(durations: readonly number[]): number | null {
  const sorted = [...durations].sort((leftDuration, rightDuration) => leftDuration - rightDuration);
  return sorted[Math.ceil(sorted.length * ADMISSION_PERFORMANCE.latencyPercentile) - 1] ?? null;
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env.RUN_ADMISSION_PERFORMANCE_TESTS !== "1")("native admission performance", () => {
  it(ADMISSION_PERFORMANCE_CASE.load, async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const setupStartedAt = performance.now();
      const { fixture, participants } = await prepareAdmissionPerformanceFixture(database, (phase) => process.stdout.write(JSON.stringify({ phase }) + "\n"));
      const setupDurationMs = performance.now() - setupStartedAt;
      const workloads = participants.map((participant) => {
        const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: participant.userId, sessionId: participant.sessionId }), (_identity, run) => database.withContext({ userId: participant.userId, email: participant.email }, run));
        const commands = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.config }).useCases;
        return { participant, accounts, commands };
      });
      const warmupStartedAt = performance.now();
      for (const workload of workloads) expect(await workload.accounts.getAuthenticatedAccount() !== null).toBe(true);
      const configuredMaximum = database.readPoolMetrics().maximum;
      expect(configuredMaximum).not.toBeNull();
      await Promise.all(Array.from({ length: configuredMaximum! }, () => database.withContext(fixture.own, (transaction) => transaction.execute(sql`select 1`))));
      const networkQueryMs = await database.withContext(fixture.own, async (transaction) => {
        const samples: number[] = [];
        for (let sampleIndex = 0; sampleIndex < ADMISSION_PERFORMANCE.networkSampleCount; sampleIndex += 1) {
          const startedAt = performance.now();
          expect((await transaction.execute<{ healthy: number }>(sql`select 1::integer as healthy`)).rows[0].healthy).toBe(1);
          samples.push(performance.now() - startedAt);
        }
        return samples;
      });
      const warmupDurationMs = performance.now() - warmupStartedAt;
      const before = database.readPoolMetrics();
      let peakWaitingCount = before.waitingCount, peakTotalCount = before.totalCount, inFlight = 0, peakInFlight = 0;
      const eventLoop = monitorEventLoopDelay({ resolution: ADMISSION_PERFORMANCE.eventLoopResolutionMs });
      eventLoop.enable();
      const sampling = setInterval(() => { const observed = database.readPoolMetrics(); peakWaitingCount = Math.max(peakWaitingCount, observed.waitingCount); peakTotalCount = Math.max(peakTotalCount, observed.totalCount); }, ADMISSION_PERFORMANCE.poolSampleIntervalMs);
      const observed: { index: number; durationMs: number; outcome: string | null; failure: string | null; cause?: unknown }[] = [];
      try {
        await Promise.all(workloads.map(async ({ participant, commands }) => {
          const startedAt = performance.now(); inFlight += 1; peakInFlight = Math.max(peakInFlight, inFlight);
          try {
            const result = await commands.submit.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: ADMISSION_PERFORMANCE.expectedPolicyVersion, confirmed: true, ...(participant.index >= ADMISSION_PERFORMANCE.enabledParticipantCount ? { message: ADMISSION_PERFORMANCE.exceptionReason } : {}) });
            observed.push({ index: participant.index, durationMs: performance.now() - startedAt, outcome: result.ok && result.value.state === "completed" ? result.value.result.outcome : null, failure: !result.ok ? result.failure.code : result.value.state !== "completed" ? ADMISSION_PERFORMANCE_FAILURE.unconfirmed : null, ...(!result.ok ? { cause: result.failure.cause } : {}) });
          } catch (error) { observed.push({ index: participant.index, durationMs: performance.now() - startedAt, outcome: null, failure: ADMISSION_PERFORMANCE_FAILURE.unexpectedException, cause: error }); }
          finally { inFlight -= 1; }
        }));
      } finally { clearInterval(sampling); eventLoop.disable(); }
      const after = database.readPoolMetrics(), p95Ms = confirmationPercentile(observed.map((result) => result.durationMs));
      const failures = observed.filter((result) => result.failure !== null || result.outcome !== ADMISSION_OUTCOME.admitted && result.outcome !== ADMISSION_OUTCOME.pending).map((result) => ({ index: result.index, code: result.failure ?? ADMISSION_PERFORMANCE_FAILURE.unexpectedOutcome, ...readPostgresTestDiagnostics(result.cause) }));
      const admitted = observed.filter((result) => result.outcome === ADMISSION_OUTCOME.admitted).length, pending = observed.filter((result) => result.outcome === ADMISSION_OUTCOME.pending).length;
      const facts = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select
        (select count(*)::integer from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}) as entries,
        (select count(*)::integer from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests,
        (select count(*)::integer from public.tribe_members where tribe_id=${fixture.tribeId} and role=${TRIBE_MEMBER_ROLE.tribemate} and status=${TRIBE_MEMBERSHIP_STATUS.active}) as basic_members,
        (select count(*)::integer from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries`)).rows[0]);
      process.stdout.write(JSON.stringify({ phase: ADMISSION_PERFORMANCE_PHASE.measurement, setupDurationMs, warmupDurationMs, networkQueryP95Ms: confirmationPercentile(networkQueryMs), networkSamples: networkQueryMs.length, participants: participants.length, admitted, pending, failures, p95Ms, targetMs: ADMISSION_PERFORMANCE.confirmationBudgetMs, peakInFlight, pool: { maximum: configuredMaximum, acquisitions: after.acquisitions - before.acquisitions, releases: after.releases - before.releases, errorReleases: after.errorReleases - before.errorReleases, peakWaitingCount, peakTotalCount, waitingAfter: after.waitingCount, checkedOutAfter: after.totalCount - after.idleCount }, eventLoopP95Ms: eventLoop.percentile(ADMISSION_PERFORMANCE.latencyPercentile * ADMISSION_PERFORMANCE.percentageScale) / ADMISSION_PERFORMANCE.nanosecondsPerMillisecond, facts, realMessages: 0 }) + "\n");
      expect(failures).toEqual([]);
      expect({ admitted, pending }).toEqual({ admitted: ADMISSION_PERFORMANCE.enabledParticipantCount, pending: ADMISSION_PERFORMANCE.participantCount - ADMISSION_PERFORMANCE.enabledParticipantCount });
      expect(facts).toEqual({ entries: ADMISSION_PERFORMANCE.entryCount, requests: ADMISSION_PERFORMANCE.participantCount, basic_members: ADMISSION_PERFORMANCE.enabledParticipantCount, deliveries: 0 });
      expect(peakInFlight).toBe(ADMISSION_PERFORMANCE.participantCount);
      expect(after.waitingCount).toBe(0); expect(after.totalCount).toBe(after.idleCount);
      expect(after.acquisitions - before.acquisitions).toBe(after.releases - before.releases);
      expect(p95Ms).not.toBeNull(); expect(p95Ms!).toBeLessThan(ADMISSION_PERFORMANCE.confirmationBudgetMs);
    }, { authorization: process.env[ADMISSION_PERFORMANCE_ENVIRONMENT.authorization], ownershipNonce: process.env[ADMISSION_PERFORMANCE_ENVIRONMENT.loadBranchNonce] });
  }, ADMISSION_PERFORMANCE.nativeCaseTimeoutMs);

  it(ADMISSION_PERFORMANCE_CASE.abandonment, async () => {
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
      let healthy: number | null = null;
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
