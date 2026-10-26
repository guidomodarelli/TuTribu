/** Verifies strict cohort and timing acceptance independently of browser automation. @module admission-entry-sample-result-tests */
import { describe, expect, it } from "vitest";
import { evaluateAdmissionEntrySample, type AdmissionEntrySampleObservation } from "@/tests/support/admission-entry-sample-result";
import { ADMISSION_ENTRY_SAMPLE as SAMPLE } from "@/tests/support/constants/admission-entry-sample";

/** @returns Ten independent measured positions immediately below the strict limit. */
function completedCohort(): AdmissionEntrySampleObservation[] {
  return Array.from({ length: SAMPLE.accounts }, (_unused, index) => ({ alias: `A${index + 1}`, browser: "chromium", width: SAMPLE.widths[0], sessionVerified: true, durationMs: SAMPLE.completionLimitMs - 1, externalDeliveryWaitMs: 0, confirmed: true, failure: null }));
}
const identityCounts = { accounts: SAMPLE.accounts, sessions: SAMPLE.accounts };

describe("automated admission entry criterion", () => {
  it("accepts nine strict completions while preserving the tenth failed observation", () => {
    const observations = completedCohort();
    observations[0] = { ...observations[0], confirmed: false, failure: "journey_failed", durationMs: null };
    expect(evaluateAdmissionEntrySample(observations, identityCounts)).toMatchObject({ passed: true, underLimit: SAMPLE.minimumCompletions, completeCohort: true });
    expect(observations).toHaveLength(SAMPLE.accounts);
  });
  it("does not count exactly two minutes or a claimed result with a browser failure", () => {
    const observations = completedCohort();
    observations[0].durationMs = SAMPLE.completionLimitMs;
    observations[1].failure = "browser_error";
    expect(evaluateAdmissionEntrySample(observations, identityCounts).passed).toBe(false);
  });
  it("refuses a missing position, reused alias, unverified session or reused native account", () => {
    const missing = completedCohort().slice(1), repeated = completedCohort(), unverified = completedCohort();
    repeated[1].alias = repeated[0].alias;
    unverified[0].sessionVerified = false;
    for (const observations of [missing, repeated, unverified]) expect(evaluateAdmissionEntrySample(observations, identityCounts).passed).toBe(false);
    expect(evaluateAdmissionEntrySample(completedCohort(), { ...identityCounts, accounts: SAMPLE.accounts - 1 }).passed).toBe(false);
  });
});
