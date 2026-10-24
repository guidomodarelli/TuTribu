/** @vitest-environment node */
/** Checks measurement arithmetic; these cases are not external performance evidence. */
import { describe, expect, it } from "vitest";
import { summarizeAdmissionDistributedPerformance } from "@/tests/support/summarize-admission-distributed-performance";
import { ADMISSION_DISTRIBUTED_NODE, type AdmissionDistributedNodeMeasurement } from "@/tests/support/constants/admission-distributed-node";
import { ADMISSION_PERFORMANCE, ADMISSION_PERFORMANCE_FAILURE } from "@/tests/support/constants/admission-performance";
import { ADMISSION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-eligibility";

/** Builds numeric observations only, without mocking a platform, SDK or application adapter. */
function observations(durationForIndex: (index: number) => number, startForNode: (nodeIndex: number) => number = () => 0): AdmissionDistributedNodeMeasurement[] {
  return Array.from({ length: ADMISSION_DISTRIBUTED_NODE.functionCount }, (_, nodeIndex) => {
    const confirmations = Array.from({ length: ADMISSION_DISTRIBUTED_NODE.poolMaximum }, (_, position) => {
      const index = position * ADMISSION_DISTRIBUTED_NODE.functionCount + nodeIndex, durationMs = durationForIndex(index), startedLowerMs = startForNode(nodeIndex);
      return { index, durationMs, startedOffsetMs: 0, outcome: index < ADMISSION_PERFORMANCE.enabledParticipantCount ? ADMISSION_OUTCOME.admitted : ADMISSION_OUTCOME.pending, failure: null, startedLowerMs, startedUpperMs: startedLowerMs + 10, finishedLowerMs: startedLowerMs + durationMs, finishedUpperMs: startedLowerMs + durationMs + 10 };
    });
    return { nodeIndex, nodeVersion: "24.21.0", sourceCommit: "numeric-fixture", bundleSha256: "numeric-fixture", participants: confirmations.length, admitted: confirmations.filter((confirmation) => confirmation.outcome === ADMISSION_OUTCOME.admitted).length, pending: confirmations.filter((confirmation) => confirmation.outcome === ADMISSION_OUTCOME.pending).length, p95Ms: null, peakInFlight: ADMISSION_DISTRIBUTED_NODE.poolMaximum, pool: { maximum: ADMISSION_DISTRIBUTED_NODE.poolMaximum, acquisitions: 75, releases: 75, errorReleases: 0, peakWaitingCount: 0, peakTotalCount: ADMISSION_DISTRIBUTED_NODE.poolMaximum, waitingAfter: 0, checkedOutAfter: 0 }, confirmations, clockBracketMs: 10, wallDurationMs: 0, eventLoopP95Ms: 0, configurationDurationMs: 0, warmupDurationMs: 0, barrierDurationMs: 0, networkQueryP95Ms: 0, networkSamples: ADMISSION_PERFORMANCE.networkSampleCount, realMessages: 0 };
  });
}

describe("distributed native measurement summary", () => {
  it("uses the global original percentile instead of the percentile of node percentiles", () => {
    const nodes = observations((index) => index === 0 || index === ADMISSION_DISTRIBUTED_NODE.functionCount ? 10_000 : index % ADMISSION_DISTRIBUTED_NODE.functionCount === 0 ? 1_000 : 2_000);
    nodes[0].p95Ms = 10_000;
    for (const node of nodes.slice(1)) node.p95Ms = 2_000;
    const result = summarizeAdmissionDistributedPerformance(nodes);
    expect(result.p95Ms).toBe(2_000);
    expect(result.participants).toBe(ADMISSION_PERFORMANCE.participantCount);
    expect(result.guaranteedHundredOverlap).toBe(true);
    expect(result.admitted).toBe(ADMISSION_PERFORMANCE.enabledParticipantCount);
  });

  it("does not add local peaks when the host windows do not overlap", () => {
    const result = summarizeAdmissionDistributedPerformance(observations(() => 1_000, (nodeIndex) => nodeIndex * 2_000));
    expect(result.nodes.every((node) => node.peakInFlight === ADMISSION_DISTRIBUTED_NODE.poolMaximum)).toBe(true);
    expect(result.guaranteedHundredOverlap).toBe(false);
    expect(result.guaranteedOverlapDurationMs).toBe(0);
  });

  it("keeps failed original confirmations in the percentile and reports their failures", () => {
    const nodes = observations((index) => index >= 94 ? 10_000 : 1_000);
    for (const node of nodes) for (const confirmation of node.confirmations) if (confirmation.index >= 94) { confirmation.failure = ADMISSION_PERFORMANCE_FAILURE.unexpectedException; confirmation.outcome = null; }
    const result = summarizeAdmissionDistributedPerformance(nodes);
    expect(result.p95Ms).toBe(10_000);
    expect(result.participants).toBe(ADMISSION_PERFORMANCE.participantCount);
    expect(result.failures).toHaveLength(6);
  });

  it("rejects duplicated actors even when the total sample count is correct", () => {
    const nodes = observations(() => 1_000);
    nodes[0].confirmations[1].index = nodes[0].confirmations[0].index;
    expect(() => summarizeAdmissionDistributedPerformance(nodes)).toThrow("incomplete_or_duplicate_actors");
  });

  it("rejects a missing host instead of measuring a smaller cohort", () => {
    expect(() => summarizeAdmissionDistributedPerformance(observations(() => 1_000).slice(1))).toThrow("incomplete_or_duplicate_hosts");
  });

  it("rejects an upper clock bound that contradicts the original measured duration", () => {
    const nodes = observations(() => 1_000);
    nodes[0].confirmations[0].finishedUpperMs += 1_000;
    expect(() => summarizeAdmissionDistributedPerformance(nodes)).toThrow("invalid_confirmation_interval");
  });
});
