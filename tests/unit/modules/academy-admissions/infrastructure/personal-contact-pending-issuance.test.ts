/** @vitest-environment node */
/** Retains the exact redeemed request lineage for personal code issue/resend without touching its independent deadline. @module personal-contact-pending-issuance-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalContactIssuance } from "@/tests/support/personal-contact-issuance-fixture";
import { advanceVerificationRequestCooldown } from "@/tests/support/contact-verification-issuance-fixture";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native redeemed personal pending code", () => {
  it("should issue and resend only for the exact existing pending while retaining its timestamps, status and invitation redemption", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, operations, invitationId, input } = await preparePersonalContactIssuance(database), requestId = randomUUID();
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,invitation_id,contact_type,normalized_contact,evidence_source,original_policy_snapshot,submitted_at,expires_at) values (${requestId},${fixture.context.tribeId},${fixture.context.userId},'personal',${invitationId},'email',${fixture.input.contact.value},'declared','{"version":1,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":false}'::jsonb,clock_timestamp(),clock_timestamp()+interval '29 days')`);
        await transaction.execute(sql`update public.academy_personal_invitations set status='redeemed',redeemed_by_user_id=${fixture.context.userId},redeemed_request_id=${requestId},redeemed_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=${invitationId}`);
      });
      const before = await database.withContext(fixture.fixture.own, async (transaction) => (await transaction.execute(sql`select status,version,submitted_at,expires_at,proof_id,binding_id from public.academy_admission_requests where id=${requestId}`)).rows[0]);
      const issued = await operations.issue({ ...input, admissionRequestId: requestId });
      if (issued.state !== "completed") throw new Error("Expected native personal pending code issue");
      await advanceVerificationRequestCooldown(database, fixture.fixture);
      const resent = await operations.resend({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId });
      expect(resent).toMatchObject({ state: "completed" });
      if (resent.state !== "completed") throw new Error("Expected native personal pending code resend");
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select personal_invitation_id,personal_request_id from public.contact_verification_challenges where id=${resent.result.challengeId}`)).rows).toEqual([{ personal_invitation_id: invitationId, personal_request_id: requestId }]);
        expect((await transaction.execute(sql`select status,version,submitted_at,expires_at,proof_id,binding_id from public.academy_admission_requests where id=${requestId}`)).rows[0]).toEqual(before);
        expect((await transaction.execute(sql`select status,version,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", version: 2, redeemed_request_id: requestId }]);
      });
    });
  }, 1_200_000);
});
