/** @vitest-environment node */
/** Exercises consumed links after real terminal decisions and explicitly authorized early retry. @module personal-invitation-terminal-request-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal terminal request", () => {
  it.each(["cancelled", "rejected"] as const)("should keep the consumed invitation unavailable when its request is %s and early retry is explicitly authorized", async (terminalStatus) => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange: the exact recipient creates the original native personal pending.
      const { fixture, applicant: createApplicant, leader } = await prepareAllowlistAdmission(database);
      const recipient = await createApplicant();
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const invitations = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, createPostgresAdmissionNotificationObligationWriter);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await invitations.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, internalName: "Fuente consumida", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Personal terminal setup failed: initial_token_unavailable");
      const submission = { ...recipient.input, expectedPolicyVersion: 3, invitationToken: created.initialToken };
      const submitted = await recipient.commands.submit.execute(submission);
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Personal terminal setup failed: original_pending_unavailable");
      expect(submitted.value.result).toMatchObject({ outcome: "pending", created: true, committedRequestVersion: 2 });
      const requestId = submitted.value.result.admissionRequestId, invitationId = created.result.invitationId;

      // Act: resolve the request, then authorize cadence without reopening its link.
      const transition = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: 2, confirmed: true as const, internalReason: "Presentación resuelta" };
      const resolved = terminalStatus === "cancelled"
        ? await recipient.commands.cancelOwn.execute(transition)
        : await leader.decide.execute({ ...transition, decision: "reject", externalMessage: null });
      expect(resolved).toMatchObject({ ok: true, value: { state: "completed", result: { status: terminalStatus, version: 3 } } });
      await fixture.confirm(REAUTHENTICATION_OPERATION.advanceAdmissionRetry, requestId);
      expect(await leader.allowRetry.execute({ ...transition, operationId: randomUUID(), expectedVersion: 3, internalReason: "Nuevo intento expresamente autorizado" })).toMatchObject({ ok: true, value: { state: "completed", result: { version: 4 } } });
      expect(await recipient.commands.submit.execute({ ...submission, operationId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      expect(await recipient.commands.submit.execute(submission)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: submitted.value.result } });

      // Assert: the terminal request and original binding survive; no second canje.
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", version: 2, redeemed_request_id: requestId }]);
        expect((await transaction.execute(sql`select id,status,version from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ id: requestId, status: terminalStatus, version: 4 }]);
        expect((await transaction.execute(sql`select owner_user_id,first_request_id from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ owner_user_id: recipient.userId, first_request_id: requestId }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select event_type from public.academy_admission_notification_obligations where request_id=${requestId} order by created_at`)).rows).toEqual([{ event_type: "pending_created" }, { event_type: terminalStatus }]);
      });
    });
  }, 1_200_000);
});
