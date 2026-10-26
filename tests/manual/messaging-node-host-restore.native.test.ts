/** @vitest-environment node */
/** Runs the complete real Node-host recovery protocol only under both explicit native opt-ins. */
import { describe, expect, it } from "vitest";
import { runMessagingNodeHostRestore } from "@/tests/support/run-messaging-node-host-restore";
import { MESSAGING_RESTORE_NODE_HOST, MESSAGING_RESTORE_NODE_PHASE } from "@/tests/support/constants/messaging-restore-node-host";
import { MESSAGING_RESTORE_SAFETY_TEST_TIMEOUT_MS } from "@/tests/support/constants/messaging-restore-safety";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env[MESSAGING_RESTORE_NODE_HOST.enabledVariable] !== MESSAGING_RESTORE_NODE_HOST.enabledValue)("actual Node host restore", () => {
  it("keeps external controls through real restore, rejects retired material before cipher work and explicitly reopens with new admission", async () => {
    const report = await runMessagingNodeHostRestore({ reportFile: process.env[MESSAGING_RESTORE_NODE_HOST.reportFileVariable], onPhase: (phase) => { process.stdout.write(JSON.stringify({ phase: "messaging_node_restore", stage: phase }) + "\n"); } });
    expect(report.failure).toBeUndefined();
    expect(report.passed).toBe(true);
    expect(report.phases.map((phase) => phase.phase)).toEqual(Object.values(MESSAGING_RESTORE_NODE_PHASE));
    expect(report.profileOutsideSqlSurvivedRestore).toBe(true);
    expect(report.originalRecordsPreserved).toBe(true);
    expect(report.inputsStable).toBe(true);
    expect(report.privateMaterialAbsent).toBe(true);
    expect(report.functionsRemoved).toBe(true);
    expect(report.branchesRemoved).toBe(true);
    expect(report.realMessages).toBe(0);
  }, MESSAGING_RESTORE_SAFETY_TEST_TIMEOUT_MS);
});
