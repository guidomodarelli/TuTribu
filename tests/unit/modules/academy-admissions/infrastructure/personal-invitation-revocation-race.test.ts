/** @vitest-environment node */
/** Exercises competing native redemption and revocation without changing the confirmed administrative action. @module personal-invitation-revocation-race-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { withAdmissionLockContention } from "@/tests/support/admission-lock-contention";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal redemption versus revocation", () => {
  it("should commit one transition and require a new withdrawal confirmation when redemption wins the real lock race", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange: the administrator observed an active resource at version two.
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database);
      const recipient = await createApplicant();
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const invitations = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, createPostgresAdmissionNotificationObligationWriter);
      const creationContext = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await invitations.create({ context: creationContext, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, internalName: "Carrera de ejemplo", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Personal revocation race setup failed: initial_token_unavailable");
      const invitationId = created.result.invitationId;
      const renameContext = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.renamePersonalInvitation, invitationId), action: "manage_invitations" as const };
      expect(await invitations.rename({ context: renameContext, operationId: randomUUID(), confirmed: true, invitationId, expectedVersion: 1, internalName: "Versión observada" })).toMatchObject({ state: "completed", result: { version: 2 } });
      const revokeContext = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.revokePersonalInvitation, invitationId), action: "manage_invitations" as const };
      const submission = { ...recipient.input, expectedPolicyVersion: 3, invitationToken: created.initialToken };
      const revocation = { context: revokeContext, operationId: randomUUID(), confirmed: true as const, invitationId, expectedVersion: 2, revokeRedeemedAuthorization: false, internalReason: "Revocar el enlace activo observado" };

      // Act: release only after PostgreSQL proves both real transactions waited.
      const [submitted, revoked] = await withAdmissionLockContention(database, fixture.own, fixture.tribeId, () => Promise.allSettled([
        recipient.commands.submit.execute(submission), invitations.revoke(revocation),
      ]));
      if (submitted.status !== "fulfilled") throw submitted.reason;
      const state = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ status: string; version: number; withdrawn: boolean; request_id: string | null }>(sql`select status,version,authorization_revoked_at is not null as withdrawn,redeemed_request_id as request_id from public.academy_personal_invitations where id=${invitationId}`)).rows[0]);
      expect(state.version).toBe(3);
      expect(state.withdrawn).toBe(false);

      // Assert both legal orderings, including their exact non-partial effects.
      if (state.status === "redeemed") {
        expect(submitted.value).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", created: true } } });
        if (revoked.status !== "rejected") throw new Error("Personal revocation race failed: stale_active_revocation_completed");
        expect(revoked.reason).toMatchObject({ code: "invitation_conflict", operationState: "completed" });
        await expect(invitations.revoke(revocation)).rejects.toMatchObject({ code: "invitation_conflict", operationState: "completed" });
        await expect(invitations.revoke({ ...revocation, expectedVersion: 3, revokeRedeemedAuthorization: true })).rejects.toMatchObject({ code: "idempotency_conflict" });
        expect(await invitations.revoke({ ...revocation, operationId: randomUUID(), expectedVersion: 3, revokeRedeemedAuthorization: true, internalReason: "Retiro canjeado confirmado de nuevo" })).toMatchObject({ state: "completed", result: { version: 4, changed: true } });
        await database.withContext(fixture.own, async (transaction) => {
          expect((await transaction.execute(sql`select status,version,authorization_revoked_at is not null as withdrawn from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", version: 4, withdrawn: true }]);
          expect((await transaction.execute(sql`select status,version,cancel_reason from public.academy_admission_requests where id=${state.request_id}`)).rows).toEqual([{ status: "cancelled", version: 3, cancel_reason: "personal_invitation_authorization_revoked" }]);
          expect((await transaction.execute(sql`select event_type from public.academy_admission_notification_obligations where request_id=${state.request_id} order by created_at`)).rows).toEqual([{ event_type: "pending_created" }, { event_type: "cancelled" }]);
        });
      } else {
        expect(state).toEqual({ status: "revoked", version: 3, withdrawn: false, request_id: null });
        if (revoked.status !== "fulfilled") throw revoked.reason;
        expect(revoked.value).toMatchObject({ state: "completed", result: { version: 3, changed: true } });
        expect(submitted.value).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
        await database.withContext(fixture.own, async (transaction) => {
          expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]);
          expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]);
        });
      }
      expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`))).rows).toEqual([{ count: 0 }]);
    }, { concurrentTransactions: 6 });
  }, 1_200_000);
});
