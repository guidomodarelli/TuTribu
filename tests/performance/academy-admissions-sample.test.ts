/** @vitest-environment node */
/** Exercises SC-021 through native accounts, original commits and persisted effects. */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { executeAdmissionMigrationCommand } from "@/tests/support/admission-migration-command";
import { deployAdmissionNodeHost, type AdmissionNodeDeployment } from "@/tests/support/admission-node-deployment";
import { ADMISSION_NODE_HOST, ADMISSION_NODE_RUN_STATE, admissionNodeStatusSchema } from "@/tests/support/constants/admission-node-host";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { ADMISSION_SAMPLE } from "@/tests/support/constants/admission-sample";

describe.skipIf(process.env.RUN_ADMISSION_SAMPLE_TESTS !== "1")("native thousand-contact admission sample", () => {
  it("should admit eight hundred distinct enabled accounts and leave two hundred unlisted accounts pending exactly once", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      await database.withServerEnvironment((environment) => executeAdmissionMigrationCommand({ ...environment, DATABASE_MIGRATION_URL: environment.DATABASE_URL }));
      const operationId = randomUUID(), token = randomBytes(ADMISSION_NODE_HOST.tokenBytes).toString("base64url");
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        await transaction.execute(sql.raw(await readFile(join(process.cwd(), "tests/support/sql/20261018053000_create_admission_node_probe.sql"), "utf8")));
        await transaction.execute(sql`insert into native_test_support.admission_node_runs(id,expected_branch) values (${operationId},${database.branch.name})`);
      });
      let deployment: AdmissionNodeDeployment | undefined;
      try {
        deployment = await deployAdmissionNodeHost(database.branch, operationId, createHash("sha256").update(token).digest("hex"));
        const url = (path: string) => new URL(path, deployment!.url);
        const denied = await fetch(url(ADMISSION_NODE_HOST.runPath), { method: "POST", redirect: "manual", signal: AbortSignal.timeout(ADMISSION_NODE_HOST.requestTimeoutMs) });
        expect(denied.status).toBe(HTTP_STATUS.unauthorized);
        const headers = { authorization: `${ADMISSION_NODE_HOST.tokenPrefix}${token}` };
        const response = await fetch(url(ADMISSION_NODE_HOST.runPath), { method: "POST", headers, redirect: "manual", signal: AbortSignal.timeout(ADMISSION_NODE_HOST.requestTimeoutMs) });
        expect(response.status).toBe(HTTP_STATUS.ok);
        const result = admissionNodeStatusSchema.parse(await response.json());
        if (process.env.ADMISSION_SAMPLE_REPORT_FILE) await writeFile(process.env.ADMISSION_SAMPLE_REPORT_FILE, JSON.stringify({ sourceCommit: deployment.sourceCommit, bundleSha256: deployment.bundleSha256, compute: deployment.compute, result }, null, 2));
        expect(result).toMatchObject({ state: ADMISSION_NODE_RUN_STATE.completed, sample: { participants: ADMISSION_SAMPLE.participantCount, enabledContacts: ADMISSION_SAMPLE.enabledParticipantCount, unlistedContacts: ADMISSION_SAMPLE.participantCount - ADMISSION_SAMPLE.enabledParticipantCount, admitted: ADMISSION_SAMPLE.enabledParticipantCount, pending: ADMISSION_SAMPLE.participantCount - ADMISSION_SAMPLE.enabledParticipantCount, prepared: { accounts: ADMISSION_SAMPLE.participantCount, validEvidence: ADMISSION_SAMPLE.participantCount, enabledContacts: ADMISSION_SAMPLE.enabledParticipantCount, existingMembers: 0 }, failures: [], realMessages: 0 } });
        const replay = await fetch(url(ADMISSION_NODE_HOST.runPath), { method: "POST", headers, redirect: "manual", signal: AbortSignal.timeout(ADMISSION_NODE_HOST.requestTimeoutMs) });
        expect(admissionNodeStatusSchema.parse(await replay.json())).toEqual(result);
        const facts = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ requests: number; applicants: number; members: number; decisions: number; pending: number; deliveries: number }>(sql`with scope as (select fixture_tribe_id as tribe_id from native_test_support.admission_node_runs where id=${operationId}) select
          (select count(*)::int from public.academy_admission_requests where tribe_id=(select tribe_id from scope)) as requests,
          (select count(distinct user_id)::int from public.academy_admission_requests where tribe_id=(select tribe_id from scope)) as applicants,
          (select count(*)::int from public.tribe_members where tribe_id=(select tribe_id from scope) and role='tribemate' and status='active') as members,
          (select count(*)::int from public.academy_admission_decisions where tribe_id=(select tribe_id from scope) and actor_kind='system' and outcome='approved') as decisions,
          (select count(*)::int from public.academy_admission_requests where tribe_id=(select tribe_id from scope) and status='pending') as pending,
          (select count(*)::int from public.message_deliveries where tribe_id=(select tribe_id from scope)) as deliveries`)).rows[0]);
        expect(facts).toEqual({ requests: ADMISSION_SAMPLE.participantCount, applicants: ADMISSION_SAMPLE.participantCount, members: ADMISSION_SAMPLE.enabledParticipantCount, decisions: ADMISSION_SAMPLE.enabledParticipantCount, pending: ADMISSION_SAMPLE.participantCount - ADMISSION_SAMPLE.enabledParticipantCount, deliveries: 0 });
      } finally { await deployment?.remove(); }
    }, { computeUnits: ADMISSION_NODE_HOST.computeUnits });
  }, ADMISSION_NODE_HOST.nativeCaseTimeoutMs);
});
