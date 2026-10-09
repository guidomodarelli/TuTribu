/** @vitest-environment node */
/** Exercises actual personal submission through native composition with exact evidence and atomic single-use effects. @module personal-invitation-admission-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal recipient admission", () => {
  it("should refuse a forwarded link then atomically redeem the exact exempt recipient once and preserve approved access after withdrawal", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), recipient = await createApplicant(), otherAccount = await createApplicant();
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      const repository = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, createPostgresAdmissionNotificationObligationWriter);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const invitation = await repository.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, internalName: "Destinatario probado", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (invitation.state !== "completed" || !invitation.initialToken) throw new Error("Expected native initial personal material");
      const invitationId = invitation.result.invitationId, token = invitation.initialToken;
      const forwarded = { ...otherAccount.input, invitationToken: token };
      expect(await otherAccount.commands.submit.execute(forwarded)).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "active", version: 1 }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${otherAccount.userId}) as requests,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${otherAccount.userId}) as bindings`)).rows).toEqual([{ requests: 0, bindings: 0 }]);
      });
      const input = { ...recipient.input, invitationToken: token }, submitted = await recipient.commands.submit.execute(input);
      expect(submitted).toMatchObject({ ok: true, value: { state: "completed", replayed: false, result: { outcome: "admitted", created: true, committedRequestVersion: 3, membership: { role: "tribemate", status: "active" } } } });
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Expected committed exact personal admission");
      const requestId = submitted.value.result.admissionRequestId;
      expect(await recipient.commands.submit.execute(input)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: submitted.value.result } });
      expect(await recipient.commands.submit.execute({ ...input, operationId: randomUUID() })).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "already_member", created: false } } });
      const member = await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select source,status,version,requires_allowlist,invitation_id,evidence_source from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ source: "personal", status: "approved", version: 3, requires_allowlist: false, invitation_id: invitationId, evidence_source: "base" }]);
        expect((await transaction.execute(sql`select status,version,redeemed_by_user_id,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", version: 2, redeemed_by_user_id: recipient.userId, redeemed_request_id: requestId }]);
        expect((await transaction.execute(sql`select actor_kind,actor_user_id,rule,allowlist_entry_id,allowlist_entry_version from public.academy_admission_decisions where request_id=${requestId}`)).rows).toEqual([{ actor_kind: "system", actor_user_id: null, rule: "automatic", allowlist_entry_id: null, allowlist_entry_version: null }]);
        expect((await transaction.execute(sql`select event_type from public.academy_admission_notification_obligations where request_id=${requestId}`)).rows).toEqual([{ event_type: "approved" }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${recipient.userId}`)).rows).toEqual([{ count: 1 }]);
        return (await transaction.execute(sql`select id,role,status,admission_membership_effect_id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows;
      });
      expect(member).toHaveLength(1);
      const revokeContext = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.revokePersonalInvitation, invitationId), action: "manage_invitations" as const };
      expect(await repository.revoke({ context: revokeContext, operationId: randomUUID(), confirmed: true, invitationId, expectedVersion: 2, revokeRedeemedAuthorization: true, internalReason: "Retiro posterior sin expulsión" })).toMatchObject({ state: "completed", result: { version: 3, changed: true } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id,role,status,admission_membership_effect_id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual(member);
        expect((await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "approved", version: 3 }]);
      });
    });
  }, 1_200_000);
});
