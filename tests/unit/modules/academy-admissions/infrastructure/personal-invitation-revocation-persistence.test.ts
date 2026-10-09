/** @vitest-environment node */
/** Exercises explicit withdrawal of a redeemed authorization together with its original pending request and notices. @module personal-invitation-revocation-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { createAcademyApprovedMembershipWriter } from "@/src/modules/tribes/infrastructure/repositories/apply-approved-academy-membership";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native redeemed personal authorization withdrawal", () => {
  it("should reject stale active revocation, then atomically cancel only the pending redeemed request and replay without another notice", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), applicant = await createApplicant();
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      const repository = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, createPostgresAdmissionNotificationObligationWriter);
      const createContext = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await repository.create({ context: createContext, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: applicant.email }, internalName: "Canje sintético", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed") throw new Error("Expected original invitation creation");
      const invitationId = created.result.invitationId, requestId = randomUUID();
      // Seed only the verified historical redemption fixture. The revoke path
      // must still exercise its real locks, CAS, decision, audit and notice.
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,invitation_id,requires_allowlist,contact_type,normalized_contact,evidence_source,global_identity_evidence_id,original_policy_snapshot,submitted_at,expires_at) values (${requestId},${fixture.tribeId},${applicant.userId},'personal',${invitationId},false,'email',${applicant.email},'base',${applicant.evidenceId},'{"version":2,"verificationEpoch":1,"mode":"allowlist","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":true}'::jsonb,clock_timestamp(),clock_timestamp()+interval '29 days')`);
        await transaction.execute(sql`update public.academy_personal_invitations set status='redeemed',redeemed_by_user_id=${applicant.userId},redeemed_request_id=${requestId},redeemed_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=${invitationId}`);
      });
      const revokeContext = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.revokePersonalInvitation, invitationId), action: "manage_invitations" as const };
      const original = { context: revokeContext, operationId: randomUUID(), confirmed: true as const, invitationId, expectedVersion: 1, revokeRedeemedAuthorization: false, internalReason: "Revocación propuesta antes del canje" };
      await expect(repository.revoke(original)).rejects.toMatchObject({ code: "invitation_conflict", operationState: "completed" });
      const withdrawal = { ...original, operationId: randomUUID(), expectedVersion: 2, revokeRedeemedAuthorization: true, internalReason: "Retiro de autorización confirmado después del canje" };
      const revoked = await repository.revoke(withdrawal);
      expect(revoked).toMatchObject({ state: "completed", result: { invitationId, version: 3, changed: true } });
      expect(await repository.revoke(withdrawal)).toEqual({ ...revoked, replayed: true });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,authorization_revoked_at is not null as withdrawn,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", version: 3, withdrawn: true, redeemed_request_id: requestId }]);
        expect((await transaction.execute(sql`select status,version,cancel_reason from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "cancelled", version: 2, cancel_reason: "personal_invitation_authorization_revoked" }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_notification_obligations where request_id=${requestId} and event_type='cancelled'`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}`)).rows).toEqual([{ count: 0 }]);
      });
    });
  }, 1_200_000);
  it("should withdraw historical approved authorization without cancelling its request or changing the real basic membership effect", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), applicant = await createApplicant();
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      const repository = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, createPostgresAdmissionNotificationObligationWriter);
      const creation = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await repository.create({ context: creation, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: applicant.email }, internalName: "Autorización previa a la admisión", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed") throw new Error("Expected original invitation for approved withdrawal");
      const invitationId = created.result.invitationId, requestId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,invitation_id,requires_allowlist,contact_type,normalized_contact,evidence_source,global_identity_evidence_id,original_policy_snapshot,submitted_at,expires_at) values (${requestId},${fixture.tribeId},${applicant.userId},'personal',${invitationId},false,'email',${applicant.email},'base',${applicant.evidenceId},'{"version":2,"verificationEpoch":1,"mode":"allowlist","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":true}'::jsonb,clock_timestamp(),clock_timestamp()+interval '29 days')`);
        await transaction.execute(sql`update public.academy_personal_invitations set status='redeemed',redeemed_by_user_id=${applicant.userId},redeemed_request_id=${requestId},redeemed_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=${invitationId}`);
      });
      // Seed a historical approval through real SQL guards and the actual
      // membership/notice collaborators. The still common-only decision writer
      // is intentionally not expanded by this withdrawal regression.
      await database.withContext(fixture.own, async (transaction) => {
        const decisionId = randomUUID(), effectId = randomUUID();
        await transaction.execute(sql`insert into public.academy_admission_decisions(id,request_id,tribe_id,user_id,request_version,outcome,actor_user_id,actor_kind,rule,policy_version,verification_epoch,internal_reason,membership_effect_id) values (${decisionId},${requestId},${fixture.tribeId},${applicant.userId},1,'approved',${fixture.userId},'user','manual_review',2,1,'Admisión histórica antes del retiro',${effectId})`);
        await transaction.execute(sql`update public.academy_admission_requests set status='approved',decision_id=${decisionId},version=version+1 where id=${requestId} and status='pending' and version=1`);
        expect(await createAcademyApprovedMembershipWriter(transaction).apply({ tribeId: fixture.tribeId, userId: applicant.userId, decisionId })).toMatchObject({ status: "joined", member: { role: "tribemate", status: "active" } });
        await createPostgresAdmissionNotificationObligationWriter(transaction).record({ id: randomUUID(), tribeId: fixture.tribeId, admissionRequestId: requestId, applicantUserId: applicant.userId, event: "approved" });
        await transaction.execute(sql`insert into public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,event_type,rule,resource_version) values (${fixture.tribeId},${fixture.userId},'admission_request',${requestId},'approved','manual_review',2)`);
      });
      const before = await database.withContext(fixture.own, async (transaction) => ({
        members: (await transaction.execute(sql`select id,role,status,admission_membership_effect_id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}`)).rows,
        effects: (await transaction.execute(sql`select id,member_id,applied_at,revoked_at from public.academy_admission_membership_effects where request_id=${requestId}`)).rows,
      }));
      expect(before.members).toHaveLength(1); expect(before.members[0]).toMatchObject({ role: "tribemate", status: "active" });
      expect(before.effects).toHaveLength(1); expect(before.effects[0]).toMatchObject({ applied_at: expect.anything(), revoked_at: null });
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.revokePersonalInvitation, invitationId), action: "manage_invitations" as const };
      const input = { context, operationId: randomUUID(), confirmed: true as const, invitationId, expectedVersion: 2, revokeRedeemedAuthorization: true, internalReason: "Retiro confirmado sin expulsión" };
      expect(await repository.revoke(input)).toMatchObject({ state: "completed", result: { version: 3, changed: true, created: false } });
      expect(await repository.revoke(input)).toMatchObject({ state: "completed", replayed: true, result: { version: 3 } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,cancel_reason from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "approved", version: 2, cancel_reason: null }]);
        expect((await transaction.execute(sql`select status,version,authorization_revoked_at is not null as withdrawn from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", version: 3, withdrawn: true }]);
        expect((await transaction.execute(sql`select id,role,status,admission_membership_effect_id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}`)).rows).toEqual(before.members);
        expect((await transaction.execute(sql`select id,member_id,applied_at,revoked_at from public.academy_admission_membership_effects where request_id=${requestId}`)).rows).toEqual(before.effects);
        expect((await transaction.execute(sql`select event_type from public.academy_admission_notification_obligations where request_id=${requestId}`)).rows).toEqual([{ event_type: "approved" }]);
      });
    });
  }, 1_200_000);
});
