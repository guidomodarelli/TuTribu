/** @vitest-environment node */
/** Exercises the original acceptance cohort on four independently authenticated Node hosts. */
import { describe, expect, it } from "vitest";
import { runAdmissionDistributedPerformance } from "@/tests/support/run-admission-distributed-performance";
import { ADMISSION_DISTRIBUTED_NODE } from "@/tests/support/constants/admission-distributed-node";
import { ADMISSION_NODE_HOST } from "@/tests/support/constants/admission-node-host";
import { ADMISSION_PERFORMANCE } from "@/tests/support/constants/admission-performance";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env[ADMISSION_DISTRIBUTED_NODE.enabledVariable] !== ADMISSION_DISTRIBUTED_NODE.enabledValue)("distributed native admission workload", () => {
  it("should retain all hundred original confirmations, conservative overlap, SQL effects, replay and the unchanged latency gate", async () => {
    const report = await runAdmissionDistributedPerformance({
      computeUnits: Number(process.env[ADMISSION_NODE_HOST.computeUnitsVariable] ?? ADMISSION_DISTRIBUTED_NODE.computeUnits),
      reportFile: process.env[ADMISSION_DISTRIBUTED_NODE.reportFileVariable],
      onPhase: (phase) => console.log(JSON.stringify({ phase })),
    });
    expect(report.measurement?.participants).toBe(ADMISSION_PERFORMANCE.participantCount);
    expect(report.measurement?.nodes).toHaveLength(ADMISSION_DISTRIBUTED_NODE.functionCount);
    expect(report.measurement?.guaranteedHundredOverlap).toBe(true);
    expect(report.correctnessPassed && report.stockAndReplayPreserved && report.separateExcludedStagesMeasured).toBe(true);
    expect(report.functionsRemoved && report.branchRemoved && report.inputsStable && report.privateMaterialAbsentFromOwnFiles && report.passed).toBe(true);
  }, ADMISSION_NODE_HOST.nativeCaseTimeoutMs);
});
