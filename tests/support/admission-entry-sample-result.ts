/** Evaluates the strict SC-014 functional criterion without claiming human usability. @module admission-entry-sample-result */
import { ADMISSION_ENTRY_SAMPLE } from "./constants/admission-entry-sample";

/** Sanitized observations retain failures and contain no identity or cookie values. */
export type AdmissionEntrySampleObservation = {
  alias: string;
  browser: "chromium" | "webkit";
  width: number;
  sessionVerified: boolean;
  durationMs: number | null;
  externalDeliveryWaitMs: 0;
  confirmed: boolean;
  failure: "journey_failed" | "browser_error" | null;
};

/**
 * Applies the complete cohort and strictly-less-than timing requirements.
 * @param observations - Every cohort position, including any failed or unmeasured position.
 * @param identityCounts - Native identities and sessions verified privately before measurement.
 * @returns A bounded summary that never converts incomplete or duplicate identities into success.
 */
export function evaluateAdmissionEntrySample(
  observations: readonly AdmissionEntrySampleObservation[],
  identityCounts: Readonly<{ accounts: number; sessions: number }>,
) {
  const independent = identityCounts.accounts === ADMISSION_ENTRY_SAMPLE.accounts
    && identityCounts.sessions === ADMISSION_ENTRY_SAMPLE.accounts;
  const completeCohort = observations.length === ADMISSION_ENTRY_SAMPLE.accounts
    && new Set(observations.map((observation) => observation.alias)).size === ADMISSION_ENTRY_SAMPLE.accounts
    && observations.every((observation) => observation.sessionVerified);
  const underLimit = observations.filter((observation) => observation.confirmed && observation.failure === null
    && observation.durationMs !== null && Number.isFinite(observation.durationMs)
    && observation.durationMs >= 0 && observation.durationMs < ADMISSION_ENTRY_SAMPLE.completionLimitMs).length;
  return { independent, completeCohort, underLimit, passed: independent && completeCohort && underLimit >= ADMISSION_ENTRY_SAMPLE.minimumCompletions };
}
