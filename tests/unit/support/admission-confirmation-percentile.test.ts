/** @vitest-environment node */
/** Exercises nearest-rank measurement over every original duration, including failed calls. */
import { describe, expect, it } from "vitest";
import { admissionConfirmationPercentile } from "@/tests/support/run-admission-performance-workload";

describe("native admission confirmation percentile", () => {
  it("should preserve null when no original observation exists", () => { expect(admissionConfirmationPercentile([])).toBeNull(); });
  it("should include the slow failed calls instead of reporting only confirmed work", () => {
    const confirmations = Array.from({ length: 90 }, () => 100), failedCalls = Array.from({ length: 10 }, () => 10_000);
    expect(admissionConfirmationPercentile([...confirmations, ...failedCalls])).toBe(10_000);
  });
  it("should sort a copy and retain the fixed nearest-rank boundary", () => {
    const durations = [3, 1, 2]; expect(admissionConfirmationPercentile(durations)).toBe(3); expect(durations).toEqual([3, 1, 2]);
  });
});
