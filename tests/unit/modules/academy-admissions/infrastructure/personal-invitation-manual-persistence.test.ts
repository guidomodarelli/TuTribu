/** @vitest-environment node */
/** Exercises native manual personal presentations, untouched alternate links and exact pending withdrawal. @module personal-invitation-manual-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native manual personal admission", () => {
  it("should preserve manual review and its original pending before another link, then approve only by the current reviewer", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant, leader } = await prepareAllowlistAdmission(database), recipient = await createApplicant();
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const repository = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, createPostgresAdmissionNotificationObligationWriter);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const create = { context, operationId: randomUUID(), confirmed: true as const, contact: { type: "email" as const, value: recipient.email }, internalName: "Revisión personal", requiresAllowlist: false, allowlistExemptionAcknowledged: true };
      const invitation = await repository.create(create);
      if (invitation.state !== "completed" || !invitation.initialToken) throw new Error("Expected native manual invitation creation");
      const input = { ...recipient.input, expectedPolicyVersion: 3, invitationToken: invitation.initialToken }, submitted = await recipient.commands.submit.execute(input);
      expect(submitted).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", created: true, committedRequestVersion: 2, membership: null, requestSnapshot: { source: "personal" } } } });
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Expected native manual personal pending");
      const requestId = submitted.value.result.admissionRequestId;
      const other = await repository.create({ ...create, operationId: randomUUID(), internalName: "Otro enlace después del canje" });
      if (other.state !== "completed" || !other.initialToken) throw new Error("Expected second independent unconsumed personal resource");
      expect(await recipient.commands.submit.execute({ ...input, operationId: randomUUID(), invitationToken: other.initialToken })).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", created: false, admissionRequestId: requestId } } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${other.result.invitationId}`)).rows).toEqual([{ status: "active", version: 1 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ count: 0 }]);
      });
      expect(await leader.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: 2, confirmed: true, decision: "approve", internalReason: "Destinatario personal revisado", externalMessage: null })).toMatchObject({ ok: true, value: { state: "completed", result: { status: "approved", version: 3 } } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,invitation_id from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "approved", version: 3, invitation_id: invitation.result.invitationId }]);
        expect((await transaction.execute(sql`select actor_kind,actor_user_id,rule from public.academy_admission_decisions where request_id=${requestId}`)).rows).toEqual([{ actor_kind: "user", actor_user_id: fixture.userId, rule: "manual_review" }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select event_type from public.academy_admission_notification_obligations where request_id=${requestId} order by created_at`)).rows).toEqual([{ event_type: "pending_created" }, { event_type: "approved" }]);
      });
    });
  }, 1_200_000);

  it("should atomically withdraw the actually redeemed pending and preserve the consumed resource after a stale active revocation is refused", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), recipient = await createApplicant();
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const repository = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, createPostgresAdmissionNotificationObligationWriter);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await repository.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, internalName: "Canje que requiere revisión", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Expected native personal pending creation");
      const input = { ...recipient.input, expectedPolicyVersion: 3, invitationToken: created.initialToken }, submitted = await recipient.commands.submit.execute(input);
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Expected original personal pending before withdrawal");
      const requestId = submitted.value.result.admissionRequestId, invitationId = created.result.invitationId;
      const revokeContext = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.revokePersonalInvitation, invitationId), action: "manage_invitations" as const };
      const revoke = { context: revokeContext, operationId: randomUUID(), confirmed: true as const, invitationId, expectedVersion: 1, revokeRedeemedAuthorization: false, internalReason: "Estado observado antes del canje" };
      await expect(repository.revoke(revoke)).rejects.toMatchObject({ code: "invitation_conflict", operationState: "completed" });
      expect(await repository.revoke({ ...revoke, operationId: randomUUID(), expectedVersion: 2, revokeRedeemedAuthorization: true })).toMatchObject({ state: "completed", result: { version: 3 } });
      expect(await recipient.commands.submit.execute(input)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: submitted.value.result } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,cancel_reason from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "cancelled", version: 3, cancel_reason: "personal_invitation_authorization_revoked" }]);
        expect((await transaction.execute(sql`select status,version,authorization_revoked_at is not null as withdrawn from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", version: 3, withdrawn: true }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ count: 0 }]);
      });
    });
  }, 1_200_000);
});
