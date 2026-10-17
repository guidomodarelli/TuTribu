/** Projects real native observations into a public artifact without private messages, identities or credentials. @module admission-performance-report */
import { ADMISSION_PERFORMANCE_CASE, ADMISSION_PERFORMANCE_PHASE, ADMISSION_PERFORMANCE_CI } from "./constants/admission-performance-runtime.mjs";
import { admissionPerformanceReportSchema } from "./constants/admission-performance-report.mjs";

/** @param value - Consumed upstream value. @returns A structurally accessible record, without provider contract revalidation. */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {}; }
/** @param value - Private measurement field. @returns A finite nonnegative number or explicit absence. */
function measuredNumber(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }

/**
 * Preserves actual case outcomes and numeric measurements while excluding all unselected fields.
 * @param {{head:string,exitCode:number|null,outputTruncated:boolean,rawReport:unknown,output:string}} input - Private process result and captured output.
 * @returns The validated own artifact; a missing case remains unverified.
 */
export function createAdmissionPerformanceReport(input) {
  const raw = record(input.rawReport);
  const cases = (Array.isArray(raw.testResults) ? raw.testResults : []).flatMap((suite) => Array.isArray(record(suite).assertionResults) ? record(suite).assertionResults : []);
  const observations = input.output.split(/\r?\n/u).flatMap((line) => {
    if (!line.startsWith("{")) return [];
    try { return [record(JSON.parse(line))]; }
    catch { return []; } // Native console output can contain ordinary non-JSON diagnostics; only selected measurements are published.
  });
  const load = observations.find((value) => value.phase === ADMISSION_PERFORMANCE_PHASE.measurement);
  const abandon = observations.find((value) => value.phase === ADMISSION_PERFORMANCE_PHASE.abandonment);
  const pool = record(load?.pool), facts = record(load?.facts), release = record(abandon?.lastErrorRelease);
  return admissionPerformanceReportSchema.parse({
    head: input.head, exitCode: input.exitCode, outputTruncated: input.outputTruncated,
    cases: Object.entries(ADMISSION_PERFORMANCE_CASE).map(([kind, title]) => {
      const found = cases.map(record).filter((candidate) => candidate.title === title);
      const current = found.length === 1 ? found[0] : {};
      return { kind, status: current.status === "passed" || current.status === "failed" ? current.status : "unverified", durationMs: measuredNumber(current.duration) };
    }),
    load: load ? {
      participants: measuredNumber(load.participants), admitted: measuredNumber(load.admitted), pending: measuredNumber(load.pending),
      failures: Array.isArray(load.failures) ? load.failures.length : null,
      poolCheckoutTimeouts: Array.isArray(load.failures) ? load.failures.filter((failure) => record(failure).poolCheckoutTimedOut === true).length : null,
      p95Ms: measuredNumber(load.p95Ms), targetMs: measuredNumber(load.targetMs), networkQueryP95Ms: measuredNumber(load.networkQueryP95Ms), networkSamples: measuredNumber(load.networkSamples),
      setupDurationMs: measuredNumber(load.setupDurationMs), warmupDurationMs: measuredNumber(load.warmupDurationMs), eventLoopP95Ms: measuredNumber(load.eventLoopP95Ms),
      pool: { maximum: measuredNumber(pool.maximum), acquisitions: measuredNumber(pool.acquisitions), releases: measuredNumber(pool.releases), peakWaitingCount: measuredNumber(pool.peakWaitingCount), waitingAfter: measuredNumber(pool.waitingAfter), checkedOutAfter: measuredNumber(pool.checkedOutAfter) },
      facts: { entries: measuredNumber(facts.entries), requests: measuredNumber(facts.requests), basicMembers: measuredNumber(facts.basic_members), deliveries: measuredNumber(facts.deliveries) },
    } : null,
    abandonment: abandon ? { observedIdleTimeoutMs: measuredNumber(abandon.observedIdleTimeoutMs), observationDurationMs: measuredNumber(abandon.observationDurationMs), healthy: measuredNumber(abandon.healthy), idleGuardConfirmed: Array.isArray(release.sqlStates) && release.sqlStates.includes(ADMISSION_PERFORMANCE_CI.idleGuardSqlState), acquisitions: measuredNumber(abandon.acquisitions), releases: measuredNumber(abandon.releases), waitingAfter: measuredNumber(abandon.waitingAfter), checkedOutAfter: measuredNumber(abandon.checkedOutAfter) } : null,
  });
}
