/** @vitest-environment node */
/** Exercises sequential real deploy/remove transitions and capability guards before the full restore fixture. */
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { deployOwnedMessagingNodes } from "@/tests/support/owned-messaging-node-deployment";
import { createAdmissionSyntheticHostingEnvironment } from "@/tests/support/admission-synthetic-hosting-environment";
import { summarizeMessagingNodeHostFailure } from "@/tests/support/messaging-node-host-failure";
import { ADMISSION_NODE_HOST } from "@/tests/support/constants/admission-node-host";
import { OWNED_MESSAGING_NODE_DEPLOYMENT as DEPLOYMENT } from "@/tests/support/constants/owned-messaging-node-deployment";
import { MESSAGING_NODE_HOST_FAILURE } from "@/tests/support/constants/messaging-node-host-failure";
import { MESSAGING_RESTORE_NODE_HOST } from "@/tests/support/constants/messaging-restore-node-host";
import { MESSAGING_HOSTING_ENV, MESSAGING_RECOVERY_LOCK_VALUE } from "@/src/modules/messaging/constants/messaging-hosting";
import { HTTP_STATUS } from "@/src/constants/http-status";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1" || process.env[DEPLOYMENT.probeEnabledVariable] !== DEPLOYMENT.probeEnabledValue)("real messaging deployment transitions", () => {
  it("deploys and removes the actual restore runtime twice while enforcing anonymous and invalid-input boundaries", async () => {
    const reportFile = process.env[DEPLOYMENT.probeReportVariable];
    if (!reportFile) throw new Error("MessagingDeploymentProbe.prepare failed: explicit_report_required");
    const report: {
      startedAt: string; passed: boolean; realMessages: number; branchId?: string; branchesRemoved?: boolean;
      rounds: Array<{ sourceCommit: string; bundleSha256: string; anonymousStatus: number; invalidInputStatus: number; invalidInputCode: string; inputsStable: boolean; privateMaterialAbsent: boolean; functionRemoved: boolean }>;
      failure?: ReturnType<typeof summarizeMessagingNodeHostFailure>;
    } = { startedAt: new Date().toISOString(), passed: false, realMessages: 0, rounds: [] };
    try {
      await withAcademyAdmissionDatabase(async (database) => {
        report.branchId = database.branch.id;
        for (let round = 0; round < DEPLOYMENT.probeRounds; round++) {
          process.stdout.write(JSON.stringify({ phase: "deployment_probe", round }) + "\n");
          const environment = { ...createAdmissionSyntheticHostingEnvironment(), [MESSAGING_HOSTING_ENV.environment]: MESSAGING_RESTORE_NODE_HOST.securityEnvironment, [MESSAGING_HOSTING_ENV.recoveryLock]: round === 0 ? MESSAGING_RECOVERY_LOCK_VALUE.unlocked : MESSAGING_RECOVERY_LOCK_VALUE.locked };
          const token = randomBytes(ADMISSION_NODE_HOST.tokenBytes).toString("base64url"), operationId = randomUUID();
          const deployment = await deployOwnedMessagingNodes(database.branch, operationId, token, environment, [{ operationId }], { entrypoint: MESSAGING_RESTORE_NODE_HOST.entrypoint, privateInputVariable: MESSAGING_RESTORE_NODE_HOST.inputVariable, supportingFiles: [DEPLOYMENT.probeTestFile] });
          try {
            const url = new URL(ADMISSION_NODE_HOST.statusPath, deployment.hosts[0].url);
            const anonymous = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(ADMISSION_NODE_HOST.requestTimeoutMs) });
            expect(anonymous.status).toBe(HTTP_STATUS.unauthorized);
            const invalidInput = await fetch(url, { headers: { authorization: `${ADMISSION_NODE_HOST.tokenPrefix}${token}` }, redirect: "error", signal: AbortSignal.timeout(ADMISSION_NODE_HOST.requestTimeoutMs) });
            expect(invalidInput.status).toBe(HTTP_STATUS.serverError);
            const body = await invalidInput.json() as { operationId?: unknown; code?: unknown };
            expect(body.operationId).toBe(operationId);
            expect(body.code).toBe(MESSAGING_NODE_HOST_FAILURE.privateInputInvalid);
            await deployment.assertInputsUnchanged(); await deployment.assertPrivateMaterialAbsent();
            await deployment.remove();
            report.rounds.push({ sourceCommit: deployment.sourceCommit, bundleSha256: deployment.bundleSha256, anonymousStatus: anonymous.status, invalidInputStatus: invalidInput.status, invalidInputCode: MESSAGING_NODE_HOST_FAILURE.privateInputInvalid, inputsStable: true, privateMaterialAbsent: true, functionRemoved: true });
          } finally { await deployment.remove(); }
        }
      }, { databaseSelection: { databaseName: "neondb", roleName: "neondb_owner" } });
      report.branchesRemoved = true;
      report.passed = report.rounds.length === DEPLOYMENT.probeRounds;
    } catch (error) { report.failure = summarizeMessagingNodeHostFailure(error); }
    await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
    expect(report.failure).toBeUndefined();
    expect(report.passed).toBe(true);
  }, ADMISSION_NODE_HOST.nativeCaseTimeoutMs);
});
