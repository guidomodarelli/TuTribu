/** @vitest-environment node */
/** Exercises the membership rule of an admission code request with real SQL, applying the same eligibility as the overview and the request writer. @module admission-contact-membership-eligibility-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("admission code request for an existing membership", () => {
  it("should send the code to a recoverable commercial tribemate and keep rejecting members and other restrictions", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, true);
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const setMembership = (status: string, reason: string, recovery: string | null) => database.withContext(fixture.fixture.own, async (transaction) => (await transaction.execute<{ role: string; status: string; status_reason: string; commercial_recovery_status: string | null }>(sql`update public.tribe_members set status=${status},status_reason=${reason},commercial_recovery_status=${recovery} where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId} returning role,status,status_reason,commercial_recovery_status`)).rows);
      await expect(operations.issue({ ...fixture.input, expectedPolicyVersion: 2, operationId: randomUUID() })).rejects.toMatchObject({ code: "admission_ineligible" });
      expect(await setMembership("blocked", "payment_blocked", "active")).toEqual([{ role: "tribemate", status: "blocked", status_reason: "payment_blocked", commercial_recovery_status: "active" }]);
      expect(await operations.issue({ ...fixture.input, expectedPolicyVersion: 2, operationId: randomUUID() })).toMatchObject({ state: "completed", result: { purpose: "admission", channel: "email" } });
      await setMembership("blocked", "conduct_blocked", null);
      await expect(operations.issue({ ...fixture.input, expectedPolicyVersion: 2, operationId: randomUUID() })).rejects.toMatchObject({ code: "membership_recovery_required" });
    });
  }, 600_000);
});
