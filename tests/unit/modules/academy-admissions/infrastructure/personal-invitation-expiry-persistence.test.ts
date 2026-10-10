/** @vitest-environment node */
/** Exercises an actual redemption before link expiry and its independent pending request lifetime. @module personal-invitation-expiry-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native redeemed link expiry", () => {
  it("should preserve and approve the original pending when its already redeemed link expires", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange: issue a short-lived native link without changing any stored date.
      const { fixture, applicant: createApplicant, leader } = await prepareAllowlistAdmission(database);
      const recipient = await createApplicant();
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const invitations = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, createPostgresAdmissionNotificationObligationWriter);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const expiresAt = new Date((await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ deadline: string }>(sql`select clock_timestamp()+interval '90 seconds' as deadline`)).rows[0].deadline)));
      const created = await invitations.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, internalName: "Plazo independiente", requiresAllowlist: false, allowlistExemptionAcknowledged: true, expiresAt });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Personal expiry setup failed: initial_token_unavailable");
      const submission = { ...recipient.input, expectedPolicyVersion: 3, invitationToken: created.initialToken };
      const submitted = await recipient.commands.submit.execute(submission);
      expect(submitted).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", created: true, committedRequestVersion: 2 } } });
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Personal expiry setup failed: committed_pending_unavailable");
      const requestId = submitted.value.result.admissionRequestId, invitationId = created.result.invitationId;

      // Act: wait on the real SQL clock, preserving the immutable link dates.
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select expires_at>clock_timestamp() as pending_live from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ pending_live: true }]);
        await transaction.execute(sql`select pg_sleep(greatest(0,extract(epoch from ${expiresAt.toISOString()}::timestamptz-clock_timestamp()))+0.1)`);
        expect((await transaction.execute(sql`select expires_at<=clock_timestamp() as link_elapsed,status,version from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ link_elapsed: true, status: "redeemed", version: 2 }]);
      });
      expect(await recipient.commands.submit.execute({ ...submission, operationId: randomUUID() })).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", created: false, admissionRequestId: requestId } } });
      expect(await leader.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: 2, confirmed: true, decision: "approve", internalReason: "Solicitud todavía vigente", externalMessage: null })).toMatchObject({ ok: true, value: { state: "completed", result: { status: "approved", version: 3 } } });

      // Assert: only request expiry governs review; the consumed token stays used.
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,expires_at>clock_timestamp() as pending_lifetime_remaining from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "approved", version: 3, pending_lifetime_remaining: true }]);
        expect((await transaction.execute(sql`select status,version,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", version: 2, redeemed_request_id: requestId }]);
        expect((await transaction.execute(sql`select role,status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ role: "tribemate", status: "active" }]);
        expect((await transaction.execute(sql`select event_type from public.academy_admission_notification_obligations where request_id=${requestId} order by created_at`)).rows).toEqual([{ event_type: "pending_created" }, { event_type: "approved" }]);
      });
    });
  }, 1_200_000);
});
