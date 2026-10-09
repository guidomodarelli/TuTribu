/** @vitest-environment node */
/** Verifies the real writer closes unsupported historical sources despite readable review facts. @module allowlist-review-scope-tests */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native allowlist reviewer source scope", () => {
  it("should deny direct approval of readable legacy and personal pendings and preserve original requests and all access effects", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant, leader } = await prepareAllowlistAdmission(database);
      const applicant = await createApplicant(), requestId = randomUUID(), invitationId = randomUUID();
      const context = await fixture.confirm("create_allowlist_entry");
      const entry = await fixture.writer.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: applicant.email }, displayName: null });
      expect(entry.state).toBe("completed");
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tribe_invitations(id,tribe_id,token_hash,created_by,status,subscription_association_type) values (${invitationId},${fixture.tribeId},${createHash("sha256").update(randomUUID()).digest("hex")},${fixture.userId},'active','free')`);
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,legacy_invitation_id,contact_type,normalized_contact,evidence_source,global_identity_evidence_id,original_policy_snapshot,applicant_message,submitted_at,expires_at) values (${requestId},${fixture.tribeId},${applicant.userId},'legacy',${invitationId},'email',${applicant.email},'base',${applicant.evidenceId},'{"version":2,"verificationEpoch":1,"mode":"allowlist","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":true}'::jsonb,'Solicitud histórica',clock_timestamp(),clock_timestamp()+interval '29 days')`);
      });
      const result = await leader.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: 1, confirmed: true, decision: "approve", internalReason: "Revisión explícita de solicitud histórica", externalMessage: null });
      expect(result).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "pending", version: 1 }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where request_id=${requestId}) as decisions,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}) as members`)).rows).toEqual([{ decisions: 0, members: 0 }]);
      });
      const personal = await createApplicant(), personalRequestId = randomUUID(), personalInvitationId = randomUUID();
      const personalContext = await fixture.confirm("create_allowlist_entry");
      expect((await fixture.writer.create({ context: personalContext, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: personal.email }, displayName: null })).state).toBe("completed");
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.academy_personal_invitations(id,tribe_id,created_by_user_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,requires_allowlist,token_hash,token_key_id,status,redeemed_by_user_id,redeemed_request_id,redeemed_at) values (${personalInvitationId},${fixture.tribeId},${fixture.userId},'email',${personal.email},${randomBytes(32)},'synthetic-contact-key',true,${randomBytes(32)},'synthetic-token-key','redeemed',${personal.userId},${personalRequestId},clock_timestamp())`);
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,invitation_id,requires_allowlist,contact_type,normalized_contact,evidence_source,global_identity_evidence_id,original_policy_snapshot,applicant_message,submitted_at,expires_at) values (${personalRequestId},${fixture.tribeId},${personal.userId},'personal',${personalInvitationId},true,'email',${personal.email},'base',${personal.evidenceId},'{"version":2,"verificationEpoch":1,"mode":"allowlist","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":true}'::jsonb,'Solicitud nominativa histórica',clock_timestamp(),clock_timestamp()+interval '29 days')`);
      });
      expect(await leader.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: personalRequestId, expectedVersion: 1, confirmed: true, decision: "approve", internalReason: "Revisión nominativa explícita", externalMessage: null })).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${personalRequestId}`)).rows).toEqual([{ status: "pending", version: 1 }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where request_id=${personalRequestId}) as decisions,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${personal.userId}) as members`)).rows).toEqual([{ decisions: 0, members: 0 }]);
      });
    });
  }, 1_200_000);
});
