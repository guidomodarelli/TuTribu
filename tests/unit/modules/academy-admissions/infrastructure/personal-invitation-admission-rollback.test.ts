/** @vitest-environment node */
/** Exercises the actual deferred commit guards when the personal submission notice port omits its obligation. @module personal-invitation-admission-rollback-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { PostgresAdmissionRequestRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-request-repository";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { SubmitAdmissionUseCase } from "@/src/modules/academy-admissions/application/use-cases/submit-admission-use-case";
import { createAcademyApprovedMembershipWriter } from "@/src/modules/tribes/infrastructure/repositories/apply-approved-academy-membership";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal admission rollback", () => {
  it("should roll back redemption, binding, decision and membership when the original notice obligation is absent", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), applicant = await createApplicant();
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      const invitations = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await invitations.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: applicant.email }, internalName: "Canje atómico", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Expected original personal resource before rollback");
      const own = { userId: applicant.userId, email: applicant.email };
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: applicant.userId, sessionId: applicant.sessionId }), (_identity, run) => database.withContext(own, run));
      // Only the project's own notification port is replaced. SQL, native auth,
      // cryptography, binding and membership collaborators remain real.
      const writer = new PostgresAdmissionRequestRepository((_scope, run) => database.withContext(own, run), async () => fixture.config, (transaction) => ({ memberships: createAcademyApprovedMembershipWriter(transaction), notifications: { record: async () => {} } }));
      const useCase = new SubmitAdmissionUseCase(accounts, writer, () => new Date());
      const input = { ...applicant.input, invitationToken: created.initialToken };
      expect(await useCase.execute(input)).toMatchObject({ ok: false, failure: { code: "operation_unresolved", operation: { operationId: input.operationId, state: "started" }, cause: { cause: { code: "23514" } } } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,redeemed_request_id,redeemed_by_user_id from public.academy_personal_invitations where id=${created.result.invitationId}`)).rows).toEqual([{ status: "active", version: 1, redeemed_request_id: null, redeemed_by_user_id: null }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}) as requests,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${applicant.userId}) as bindings,(select count(*)::int from public.academy_admission_decisions where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}) as decisions,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}) as members`)).rows).toEqual([{ requests: 0, bindings: 0, decisions: 0, members: 0 }]);
        expect((await transaction.execute(sql`select state,public_result from public.academy_admission_operations where actor_user_id=${applicant.userId} and idempotency_key=${input.operationId}`)).rows).toEqual([{ state: "started", public_result: null }]);
      });
    });
  }, 1_200_000);
});
