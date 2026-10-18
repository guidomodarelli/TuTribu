/** Runs the same real application workload on local, CI and colocated Node hosts. */
import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import type { AdmissionPerformanceParticipant } from "./admission-performance-fixture";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { ADMISSION_PERFORMANCE, ADMISSION_PERFORMANCE_FAILURE } from "./constants/admission-performance";
import { ADMISSION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { readPostgresTestDiagnostics } from "./postgres-test-diagnostics";
import type { RequestDatabase, RequestDatabaseContext } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Limits the portable host to actual transaction execution and pool observation. */
export type AdmissionPerformanceDatabase = Pick<AcademyAdmissionTestDatabase, "withContext" | "readPoolMetrics">;
/** Holds only synthetic fixture identities and private nonextractable hosting keys. */
export type AdmissionPerformanceFixture = { tribeId: string; own: { userId: string; email: string | null }; config: MessagingSecurityConfig };
/** Describes the persisted effects counted after all original commands settle. */
export type AdmissionPerformanceFacts = { entries: number; requests: number; basic_members: number; deliveries: number };
/** Optional own observation boundary; default workloads retain their original protocol. */
export type AdmissionPerformanceObserver = { beforeMeasurement: () => Promise<void>; afterMeasurement: () => Promise<void> };

/** @param durations - All original observations, including failed calls. @returns The fixed nearest-rank percentile, or null for no observations. */
export function admissionConfirmationPercentile(durations: readonly number[]): number | null {
  const sorted = [...durations].sort((leftDuration, rightDuration) => leftDuration - rightDuration);
  return sorted[Math.ceil(sorted.length * ADMISSION_PERFORMANCE.latencyPercentile) - 1] ?? null;
}

/**
 * Preserves native accounts, claim/effect commits, warm-up and the entire concurrent cohort.
 * @param database - Real branch-scoped database adapter, never a provider or UI mock.
 * @param fixture - Prepared academy and synthetic host keys.
 * @param participants - The actual seeded identities; the fixed cohort is validated by its caller.
 * @returns Only numeric measurements, safe failure diagnostics and persisted-effect counts.
 */
export async function runAdmissionPerformanceWorkload(database: AdmissionPerformanceDatabase, fixture: AdmissionPerformanceFixture, participants: readonly AdmissionPerformanceParticipant[], observer?: AdmissionPerformanceObserver) {
  const transactionDurations = { account: [] as number[], command: [] as number[] };
  /** @param kind - Own execution boundary, never an SDK hook. @param context - Actual server identity. @param run - Original application statements. @returns The unchanged native outcome with only wall time observed. */
  async function transact<Result>(kind: "account" | "command", context: RequestDatabaseContext, run: (transaction: RequestDatabase) => Promise<Result>): Promise<Result> {
    const began = performance.now();
    try { return await database.withContext(context, run); }
    finally { transactionDurations[kind].push(performance.now() - began); }
  }
  const workloads = participants.map((participant) => {
    const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: participant.userId, sessionId: participant.sessionId }), (_identity, run) => transact("account", { userId: participant.userId, email: participant.email }, run));
    const commands = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => transact("command", { userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.config }).useCases;
    return { participant, accounts, commands };
  });
  const warmupStartedAt = performance.now();
  for (const workload of workloads) if (!await workload.accounts.getAuthenticatedAccount()) throw new Error("AdmissionPerformanceWorkload.warmup failed: native_account_unavailable");
  const configuredMaximum = database.readPoolMetrics().maximum;
  if (configuredMaximum === null) throw new Error("AdmissionPerformanceWorkload.warmup failed: pool_capacity_unavailable");
  await Promise.all(Array.from({ length: configuredMaximum }, () => database.withContext(fixture.own, (transaction) => transaction.execute(sql`select 1`))));
  const networkQueryMs = await database.withContext(fixture.own, async (transaction) => {
    const samples: number[] = [];
    for (let sampleIndex = 0; sampleIndex < ADMISSION_PERFORMANCE.networkSampleCount; sampleIndex += 1) {
      const startedAt = performance.now();
      if ((await transaction.execute<{ healthy: number }>(sql`select 1::integer as healthy`)).rows[0].healthy !== 1) throw new Error("AdmissionPerformanceWorkload.warmup failed: native_query_unhealthy");
      samples.push(performance.now() - startedAt);
    }
    return samples;
  });
  const warmupDurationMs = performance.now() - warmupStartedAt;
  await observer?.beforeMeasurement();
  const before = database.readPoolMetrics();
  transactionDurations.account.length = 0; transactionDurations.command.length = 0;
  const cpuBefore = process.cpuUsage(), utilizationBefore = performance.eventLoopUtilization(), measurementStarted = performance.now();
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
  const cpu = process.cpuUsage(cpuBefore), utilization = performance.eventLoopUtilization(utilizationBefore);
  const diagnostics = { wallDurationMs: performance.now() - measurementStarted, cpuUserMs: cpu.user / ADMISSION_PERFORMANCE.microsecondsPerMillisecond, cpuSystemMs: cpu.system / ADMISSION_PERFORMANCE.microsecondsPerMillisecond, eventLoopActiveMs: utilization.active, eventLoopIdleMs: utilization.idle, eventLoopUtilization: utilization.utilization,
    accountTransactions: transactionDurations.account.length, commandTransactions: transactionDurations.command.length, accountTransactionP95Ms: admissionConfirmationPercentile(transactionDurations.account), commandTransactionP95Ms: admissionConfirmationPercentile(transactionDurations.command),
    admittedP95Ms: admissionConfirmationPercentile(observed.filter((result) => result.outcome === ADMISSION_OUTCOME.admitted).map((result) => result.durationMs)), pendingP95Ms: admissionConfirmationPercentile(observed.filter((result) => result.outcome === ADMISSION_OUTCOME.pending).map((result) => result.durationMs)) };
  const after = database.readPoolMetrics(), p95Ms = admissionConfirmationPercentile(observed.map((result) => result.durationMs));
  const failures = observed.filter((result) => result.failure !== null || result.outcome !== ADMISSION_OUTCOME.admitted && result.outcome !== ADMISSION_OUTCOME.pending).map((result) => ({ index: result.index, code: result.failure ?? ADMISSION_PERFORMANCE_FAILURE.unexpectedOutcome, ...readPostgresTestDiagnostics(result.cause) }));
  const admitted = observed.filter((result) => result.outcome === ADMISSION_OUTCOME.admitted).length, pending = observed.filter((result) => result.outcome === ADMISSION_OUTCOME.pending).length;
  await observer?.afterMeasurement();
  const facts = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<AdmissionPerformanceFacts>(sql`select
    (select count(*)::integer from public.academy_allowlist_entries where tribe_id=${fixture.tribeId}) as entries,
    (select count(*)::integer from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests,
    (select count(*)::integer from public.tribe_members where tribe_id=${fixture.tribeId} and role=${TRIBE_MEMBER_ROLE.tribemate} and status=${TRIBE_MEMBERSHIP_STATUS.active}) as basic_members,
    (select count(*)::integer from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries`)).rows[0]);
  return { warmupDurationMs, networkQueryP95Ms: admissionConfirmationPercentile(networkQueryMs), networkSamples: networkQueryMs.length, participants: participants.length, admitted, pending, failures, p95Ms, targetMs: ADMISSION_PERFORMANCE.confirmationBudgetMs, peakInFlight, pool: { maximum: configuredMaximum, acquisitions: after.acquisitions - before.acquisitions, releases: after.releases - before.releases, errorReleases: after.errorReleases - before.errorReleases, peakWaitingCount, peakTotalCount, waitingAfter: after.waitingCount, checkedOutAfter: after.totalCount - after.idleCount }, eventLoopP95Ms: eventLoop.percentile(ADMISSION_PERFORMANCE.latencyPercentile * ADMISSION_PERFORMANCE.percentageScale) / ADMISSION_PERFORMANCE.nanosecondsPerMillisecond, facts, realMessages: 0, diagnostics };
}
