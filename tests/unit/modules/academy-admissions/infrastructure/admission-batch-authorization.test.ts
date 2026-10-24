/** @vitest-environment node */
/** Exercises native batch scope, self-review and authority changes without client permission flags. @module admission-batch-authorization-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionBatch } from "@/tests/support/admission-batch-database-fixture";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission batch authority", () => {
  it("should deny nonreviewers and self review and recheck current role and session before replaying an original", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given native accounts, an active guardian and an unrelated nonmember.
      const guardianId = randomUUID(), guardianSession = randomUUID(), nonmemberSession = randomUUID();
      const fixture = await prepareAdmissionBatch(database, async (scope) => database.withContext({ userId: scope.leaderUserId, email: null }, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${guardianId},'Synthetic existing guardian',${`${guardianId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${guardianSession},${guardianId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${scope.tribeId},${guardianId},'guardian','active')`);
      }));
      const [guardian, applicant, nonmember] = await fixture.seedPendingSelection(3, [guardianId]);
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${nonmemberSession},${nonmember.applicantId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
      });
      const input = { ...fixture.scope, userId: guardian.applicantId, sessionId: guardianSession, operationId: randomUUID(), confirmed: true as const, decision: "reject" as const, internalReason: "Revisión por guardián vigente", externalMessage: null, items: [
        { admissionRequestId: guardian.admissionRequestId, expectedVersion: 1 },
        { admissionRequestId: applicant.admissionRequestId, expectedVersion: 1 },
      ] };

      // When a nonreviewer calls the concrete writer, no claim or row effect is accepted.
      await expect(fixture.writer.decideBatch({ ...input, userId: nonmember.applicantId, sessionId: nonmemberSession, operationId: randomUUID() })).rejects.toMatchObject({ code: "permission_denied" });
      const original = await fixture.writer.decideBatch(input);

      // Then the active guardian can decide another account but never their own request.
      expect(original).toMatchObject({ state: "completed", replayed: false });
      if (original.state !== "completed") throw new Error("Authorized native batch did not complete");
      expect(original.result.results).toHaveLength(2);
      expect(original.result.results).toEqual(expect.arrayContaining([
        { admissionRequestId: guardian.admissionRequestId, status: "denied", code: "permission_denied" },
        { admissionRequestId: applicant.admissionRequestId, status: "rejected", version: 2 },
      ]));
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='tribemate' where tribe_id=${fixture.tribeId} and user_id=${guardian.applicantId}`));
      await expect(fixture.writer.decideBatch(input)).rejects.toMatchObject({ code: "permission_denied" });
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${guardian.applicantId}`);
        await transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${guardianSession}`);
      });
      await expect(fixture.writer.decideBatch({ ...input, operationId: randomUUID() })).rejects.toMatchObject({ code: "authentication_required" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_operations where tribe_id=${fixture.tribeId} and operation_type='decide_admission_requests_batch'`)).rows[0].count).toBe(1);
        expect((await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_decisions where tribe_id=${fixture.tribeId} and outcome='rejected'`)).rows[0].count).toBe(1);
      });
    });
  }, 1_200_000);
});
