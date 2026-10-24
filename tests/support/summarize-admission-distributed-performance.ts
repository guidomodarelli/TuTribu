/** Aggregates every original confirmation without replacing global concurrency by local peaks. */
import { ADMISSION_OUTCOME } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_DISTRIBUTED_NODE, type AdmissionDistributedNodeMeasurement } from "./constants/admission-distributed-node";
import { ADMISSION_PERFORMANCE, ADMISSION_PERFORMANCE_FAILURE } from "./constants/admission-performance";
import { admissionConfirmationPercentile } from "./run-admission-performance-workload";

/**
 * Computes the fixed cohort's global percentile and conservative overlap from original samples.
 * @param nodes - Safe producer measurements read by the exact owned-branch coordinator.
 * @returns Counts, failures and timings from all hundred calls, including failed calls.
 * @throws When a missing/duplicate actor, host or invalid interval would make the result untrustworthy.
 */
export function summarizeAdmissionDistributedPerformance(nodes: readonly AdmissionDistributedNodeMeasurement[]) {
  const expectedNodeIndexes = Array.from({ length: ADMISSION_DISTRIBUTED_NODE.functionCount }, (_, index) => index);
  if (nodes.length !== expectedNodeIndexes.length || expectedNodeIndexes.some((nodeIndex) => nodes.filter((node) => node.nodeIndex === nodeIndex).length !== 1)) throw new Error("AdmissionDistributedSummary.summarize failed: incomplete_or_duplicate_hosts");
  for (const node of nodes) {
    if (node.participants !== ADMISSION_DISTRIBUTED_NODE.poolMaximum || node.confirmations.length !== ADMISSION_DISTRIBUTED_NODE.poolMaximum || node.confirmations.some((confirmation) => confirmation.index % ADMISSION_DISTRIBUTED_NODE.functionCount !== node.nodeIndex)) throw new Error("AdmissionDistributedSummary.summarize failed: inconsistent_actor_partition");
  }
  const confirmations = nodes.flatMap((node) => node.confirmations);
  if (confirmations.length !== ADMISSION_PERFORMANCE.participantCount || new Set(confirmations.map((confirmation) => confirmation.index)).size !== ADMISSION_PERFORMANCE.participantCount || confirmations.some((confirmation) => !Number.isSafeInteger(confirmation.index) || confirmation.index < 0 || confirmation.index >= ADMISSION_PERFORMANCE.participantCount)) throw new Error("AdmissionDistributedSummary.summarize failed: incomplete_or_duplicate_actors");
  for (const confirmation of confirmations) {
    const numbers = [confirmation.durationMs, confirmation.startedOffsetMs, confirmation.startedLowerMs, confirmation.startedUpperMs, confirmation.finishedLowerMs, confirmation.finishedUpperMs];
    if (numbers.some((value) => !Number.isFinite(value)) || confirmation.durationMs < 0 || confirmation.startedOffsetMs < 0 || confirmation.startedLowerMs > confirmation.startedUpperMs || confirmation.finishedLowerMs > confirmation.finishedUpperMs || Math.abs(confirmation.finishedLowerMs - confirmation.startedLowerMs - confirmation.durationMs) > ADMISSION_DISTRIBUTED_NODE.clockArithmeticToleranceMs || Math.abs(confirmation.finishedUpperMs - confirmation.startedUpperMs - confirmation.durationMs) > ADMISSION_DISTRIBUTED_NODE.clockArithmeticToleranceMs) throw new Error("AdmissionDistributedSummary.summarize failed: invalid_confirmation_interval");
  }
  const latestStartUpperMs = Math.max(...confirmations.map((confirmation) => confirmation.startedUpperMs));
  const earliestFinishLowerMs = Math.min(...confirmations.map((confirmation) => confirmation.finishedLowerMs));
  return {
    nodes, participants: confirmations.length,
    failures: confirmations.filter((confirmation) => confirmation.failure !== null || confirmation.outcome !== ADMISSION_OUTCOME.admitted && confirmation.outcome !== ADMISSION_OUTCOME.pending).map((confirmation) => ({ index: confirmation.index, code: confirmation.failure ?? ADMISSION_PERFORMANCE_FAILURE.unexpectedOutcome })),
    admitted: confirmations.filter((confirmation) => confirmation.outcome === ADMISSION_OUTCOME.admitted).length,
    pending: confirmations.filter((confirmation) => confirmation.outcome === ADMISSION_OUTCOME.pending).length,
    p95Ms: admissionConfirmationPercentile(confirmations.map((confirmation) => confirmation.durationMs)), targetMs: ADMISSION_PERFORMANCE.confirmationBudgetMs,
    guaranteedHundredOverlap: latestStartUpperMs < earliestFinishLowerMs,
    guaranteedOverlapDurationMs: Math.max(0, earliestFinishLowerMs - latestStartUpperMs),
    maximumClockBracketMs: Math.max(...nodes.map((node) => node.clockBracketMs)),
    poolAcquisitions: nodes.reduce((count, node) => count + node.pool.acquisitions, 0),
    poolReleases: nodes.reduce((count, node) => count + node.pool.releases, 0), realMessages: 0,
  };
}
