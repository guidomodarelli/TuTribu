/** @vitest-environment node */
/** Exercises the actual public-artifact projection with private canaries and real Vitest JSON shapes. @module admission-performance-report-tests */
import { describe, expect, it } from "vitest";
import { createAdmissionPerformanceReport } from "./admission-performance-report.mjs";
import { ADMISSION_PERFORMANCE_CASE, ADMISSION_PERFORMANCE_PHASE } from "./constants/admission-performance-runtime.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

describe("native admission performance artifact", () => {
  it("should refuse an incomplete native capability before starting resources or printing its private token", async () => {
    const privateCanary = "private-ci-capability-canary";
    try {
      await promisify(execFile)(process.execPath, [join(process.cwd(), "scripts/ci/run-admission-performance.mjs")], { cwd: process.cwd(), env: { NODE_ENV: "test", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NEON_ADMISSION_TEST_API_KEY: privateCanary }, windowsHide: true });
      throw new Error("Native runner accepted an incomplete resource plan");
    } catch (error) {
      const observed = error as { code?: number; stdout?: string; stderr?: string };
      expect(observed.code).toBe(1);
      expect(observed.stderr).toContain("requires its explicit temporary project capability");
      expect((observed.stdout ?? "") + (observed.stderr ?? "")).not.toContain(privateCanary);
    }
  });

  it("should preserve a failed workload and confirmed idle guard without exposing private diagnostic fields", () => {
    // Arrange: neither the provider payload nor the original failure belongs in the public artifact.
    const privateCanary = "private-token-and-contact@example.test";
    const rawReport = { testResults: [{ assertionResults: [
      { title: ADMISSION_PERFORMANCE_CASE.load, status: "failed", duration: 107_000, failureMessages: [privateCanary], secret: privateCanary },
      { title: ADMISSION_PERFORMANCE_CASE.abandonment, status: "passed", duration: 33_000 },
    ] }], token: privateCanary };
    const output = [privateCanary, JSON.stringify({ phase: "provider_error", token: privateCanary }), JSON.stringify({
      phase: ADMISSION_PERFORMANCE_PHASE.measurement, participants: 100, admitted: 5, pending: 1,
      failures: [{ poolCheckoutTimedOut: true, cause: privateCanary }], p95Ms: 107_240, targetMs: 3_000,
      networkQueryP95Ms: 166, networkSamples: 20, pool: { maximum: 10, acquisitions: 326, releases: 326, peakWaitingCount: 90, waitingAfter: 0, checkedOutAfter: 0 },
      facts: { entries: 10_000, requests: 6, basic_members: 5, deliveries: 0 }, secret: privateCanary,
    }), JSON.stringify({ phase: ADMISSION_PERFORMANCE_PHASE.abandonment, observedIdleTimeoutMs: 30_000, healthy: 1, lastErrorRelease: { sqlStates: ["25P03"], token: privateCanary } })].join("\n");

    // Act: construct and validate the own DTO rather than forwarding any original object.
    const artifact = createAdmissionPerformanceReport({ head: "a".repeat(40), exitCode: 1, outputTruncated: false, rawReport, output });

    // Assert: a failed performance run remains failed and all private source fields disappear.
    expect(artifact.cases).toEqual([{ kind: "load", status: "failed", durationMs: 107_000 }, { kind: "abandonment", status: "passed", durationMs: 33_000 }]);
    expect(artifact.load).toMatchObject({ p95Ms: 107_240, networkQueryP95Ms: 166, failures: 1, poolCheckoutTimeouts: 1, facts: { entries: 10_000, requests: 6, basicMembers: 5, deliveries: 0 } });
    expect(artifact.abandonment).toMatchObject({ healthy: 1, idleGuardConfirmed: true });
    expect(artifact.exitCode).toBe(1);
    expect(JSON.stringify(artifact)).not.toContain(privateCanary);
  });

  it("should keep missing or duplicated cases unverified when the native report cannot identify a unique completion", () => {
    const rawReport = { testResults: [{ assertionResults: [{ title: ADMISSION_PERFORMANCE_CASE.load, status: "passed" }, { title: ADMISSION_PERFORMANCE_CASE.load, status: "passed" }] }] };
    const artifact = createAdmissionPerformanceReport({ head: "b".repeat(40), exitCode: 0, outputTruncated: true, rawReport, output: "ordinary diagnostic\n{incomplete" });
    expect(artifact.cases.every((testCase) => testCase.status === "unverified")).toBe(true);
    expect(artifact.load).toBeNull(); expect(artifact.abandonment).toBeNull();
    expect(artifact.outputTruncated).toBe(true);
  });

  it("should reject unusable own metadata when the public artifact head is not a commit identifier", () => {
    expect(() => createAdmissionPerformanceReport({ head: "private-canary", exitCode: null, outputTruncated: false, rawReport: null, output: "" })).toThrow();
  });
});
