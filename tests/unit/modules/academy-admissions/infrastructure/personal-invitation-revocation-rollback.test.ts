/** @vitest-environment node */
/** Verifies redeemed withdrawal cannot commit without its own protected cancellation notice. @module personal-invitation-revocation-rollback-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native redeemed withdrawal rollback", () => {
  it("should retain invitation authorization and pending request when its notice collaborator omits the obligation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), applicant = await createApplicant();
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      // Omit only the project's own notice port to exercise the actual deferred
      // PostgreSQL commit guard; no SDK, validator or persistence is mocked.
      const repository = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, () => ({ record: async () => {} }));
      const creation = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await repository.create({ context: creation, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: applicant.email }, internalName: "Autorización protegida", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed") throw new Error("Expected native revocation rollback seed");
      const invitationId = created.result.invitationId, requestId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,invitation_id,requires_allowlist,contact_type,normalized_contact,evidence_source,global_identity_evidence_id,original_policy_snapshot,submitted_at,expires_at) values (${requestId},${fixture.tribeId},${applicant.userId},'personal',${invitationId},false,'email',${applicant.email},'base',${applicant.evidenceId},'{"version":2,"verificationEpoch":1,"mode":"allowlist","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":true}'::jsonb,clock_timestamp(),clock_timestamp()+interval '29 days')`);
        await transaction.execute(sql`update public.academy_personal_invitations set status='redeemed',redeemed_by_user_id=${applicant.userId},redeemed_request_id=${requestId},redeemed_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=${invitationId}`);
      });
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.revokePersonalInvitation, invitationId), action: "manage_invitations" as const }, operationId = randomUUID();
      await expect(repository.revoke({ context, operationId, confirmed: true, invitationId, expectedVersion: 2, revokeRedeemedAuthorization: true, internalReason: "Retiro debe incluir el aviso" })).rejects.toMatchObject({ code: "operation_unresolved", operationId });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,authorization_revoked_at from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", version: 2, authorization_revoked_at: null }]);
        expect((await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "pending", version: 1 }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where request_id=${requestId}) as decisions,(select count(*)::int from public.academy_admission_notification_obligations where request_id=${requestId}) as notices`)).rows).toEqual([{ decisions: 0, notices: 0 }]);
        expect((await transaction.execute(sql`select state,public_result from public.academy_admission_operations where idempotency_key=${operationId}`)).rows).toEqual([{ state: "started", public_result: null }]);
      });
    });
  }, 1_200_000);
});
