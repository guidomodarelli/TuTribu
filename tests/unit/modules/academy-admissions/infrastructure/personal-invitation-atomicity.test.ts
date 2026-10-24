/** @vitest-environment node */
/** Exercises real concurrent recipient confirmations and indivisible single-use effects. @module personal-invitation-atomicity-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal invitation contention", () => {
  it("should redeem exactly once when one hundred distinct confirmations compete for the same personal invitation", async () => {
    // Arrange: all account, evidence, token and SQL collaborators remain real.
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database);
      const recipient = await createApplicant();
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      const invitations = new PostgresPersonalInvitationRepository(
        (_context, run) => database.withContext(fixture.own, run),
        async () => fixture.config,
        createPostgresAdmissionNotificationObligationWriter,
      );
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await invitations.create({
        context, operationId: randomUUID(), confirmed: true,
        contact: { type: "email", value: recipient.email },
        internalName: "Confirmaciones simultáneas", requiresAllowlist: false,
        allowlistExemptionAcknowledged: true,
      });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Personal invitation contention setup failed: initial_token_unavailable");
      const invitationId = created.result.invitationId, token = created.initialToken;
      const attempts = Array.from({ length: 100 }, () => ({
        ...recipient.input, requestId: randomUUID(), operationId: randomUUID(), invitationToken: token,
      }));
      expect(new Set(attempts.map((attempt) => attempt.operationId)).size).toBe(100);

      // Act: start every explicit confirmation before awaiting any result.
      const settled = await Promise.allSettled(attempts.map((attempt) => recipient.commands.submit.execute(attempt)));
      expect(settled.filter((result) => result.status === "rejected")).toEqual([]);
      const results = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      expect(results).toHaveLength(100);
      const failures = results.flatMap((result) => result.ok ? [] : [result.failure.code]);
      const effects = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}) as bindings,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}) as memberships,(select count(*)::int from public.academy_admission_operations where tribe_id=${fixture.tribeId} and actor_user_id=${recipient.userId} and operation_type='submit_admission') as operations`)).rows[0]);
      process.stdout.write(JSON.stringify({ phase: "personal_invitation_contention_settled", attempts: results.length, failures, effects }) + "\n");
      expect(failures).toEqual([]);
      const completed = results.flatMap((result) => result.ok && result.value.state === "completed" ? [result.value] : []);
      const admissions = completed.filter((result) => result.result.created);
      expect(admissions).toHaveLength(1);
      const admission = admissions[0];
      expect(admission).toMatchObject({ state: "completed", replayed: false, result: { outcome: "admitted", committedRequestVersion: 3, membership: { role: "tribemate", status: "active" } } });
      expect(completed.filter((result) => !result.result.created).every((result) => result.result.outcome === "already_member")).toBe(true);
      const requestId = admission.result.admissionRequestId;
      if (!requestId) throw new Error("Personal invitation contention result failed: committed_request_unavailable");

      // Assert: all business effects refer to the same committed redemption.
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,redeemed_by_user_id,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", version: 2, redeemed_by_user_id: recipient.userId, redeemed_request_id: requestId }]);
        expect((await transaction.execute(sql`select id,source,status,version,invitation_id from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ id: requestId, source: "personal", status: "approved", version: 3, invitation_id: invitationId }]);
        expect((await transaction.execute(sql`select owner_user_id,first_request_id from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ owner_user_id: recipient.userId, first_request_id: requestId }]);
        expect((await transaction.execute(sql`select outcome,actor_kind,rule from public.academy_admission_decisions where request_id=${requestId}`)).rows).toEqual([{ outcome: "approved", actor_kind: "system", rule: "automatic" }]);
        expect((await transaction.execute(sql`select role,status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ role: "tribemate", status: "active" }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_membership_effects where request_id=${requestId} and applied_at is not null`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select event_type from public.academy_admission_notification_obligations where request_id=${requestId}`)).rows).toEqual([{ event_type: "approved" }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_operations where tribe_id=${fixture.tribeId} and actor_user_id=${recipient.userId} and operation_type='submit_admission'`)).rows).toEqual([{ count: 100 }]);
      });
      const original = attempts.find((attempt) => attempt.operationId === admission.operationId);
      if (!original) throw new Error("Personal invitation contention recovery failed: original_operation_unavailable");
      expect(await recipient.commands.submit.execute(original)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: admission.result } });
      process.stdout.write(JSON.stringify({ phase: "personal_invitation_contention", attempts: results.length, completed: completed.length, started: results.length - completed.length, redemptions: admissions.length }) + "\n");
    }, { concurrentTransactions: 100 });
  }, 3_600_000);
});
