/** @vitest-environment node */
/** Exercises real personal redemption, decision and membership exit without restoring consumed authority. @module academy-membership-reentry-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { ManageTribeMembershipUseCases } from "@/src/modules/tribes/application/use-cases/manage-tribe-membership-use-cases";
import { PostgresTribeMembershipLifecycleRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-membership-lifecycle-repository";
import { createAdmissionMembershipLifecycleWriter } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal membership exit", () => {
  it("should retain the actual personal redemption and original binding after approval and exit while preventing the old approval from granting reentry", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant, leader } = await prepareAllowlistAdmission(database);
      for (const migration of ["20261009130000_add_personal_invitation_context_digest.sql", "20261006180000_guard_subscription_membership_sources.sql", "20261007020000_resolve_paid_admission_requests.sql", "20261007023000_close_unavailable_admission_requests.sql"]) await database.applyMigration(migration);
      const recipient = await createApplicant();
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const invitations = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, createPostgresAdmissionNotificationObligationWriter);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await invitations.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, internalName: "Ingreso antes de salir", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Membership reentry setup failed: original personal token unavailable");
      const submission = { ...recipient.input, expectedPolicyVersion: 3, invitationToken: created.initialToken };
      const submitted = await recipient.commands.submit.execute(submission);
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Membership reentry setup failed: real personal pending unavailable");
      expect(submitted.value.result).toMatchObject({ outcome: "pending", committedRequestVersion: 2 });
      const admissionRequestId = submitted.value.result.admissionRequestId;
      const approved = await leader.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId, expectedVersion: 2, confirmed: true, decision: "approve", internalReason: "Ingreso comprobado", externalMessage: null });
      expect(approved).toMatchObject({ ok: true, value: { state: "completed", result: { status: "approved" } } });
      const original = await database.withContext(fixture.own, async (transaction) => ({
        member: (await transaction.execute<{id: string;admission_membership_effect_id: string}>(sql`select id,admission_membership_effect_id from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows[0],
        invitation: (await transaction.execute(sql`select status,version,redeemed_request_id,redeemed_by_user_id,redeemed_at::text from public.academy_personal_invitations where id=${created.result.invitationId}`)).rows[0],
        binding: (await transaction.execute(sql`select id,owner_user_id,first_request_id,first_proof_id,created_at::text from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${recipient.userId}`)).rows[0],
      }));
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: recipient.userId, sessionId: recipient.sessionId }), (_identity, run) => database.withContext({ userId: recipient.userId, email: recipient.email }, run));
      const writer = new PostgresTribeMembershipLifecycleRepository((_scope, run) => database.withContext({ userId: recipient.userId, email: recipient.email }, run), async () => fixture.config, createAdmissionMembershipLifecycleWriter);
      const membership = new ManageTribeMembershipUseCases(accounts, writer);
      expect(await membership.change({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), memberId: original.member.id, action: "leave", expectedStatus: "active", confirmed: true })).toMatchObject({ state: "completed", result: { outcome: "changed", deleted: true } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set is_open=false,version=version+1 where tribe_id=${fixture.tribeId}`));
      expect(await recipient.commands.submit.execute({ ...submission, operationId: randomUUID(), expectedPolicyVersion: 4 })).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      expect(await recipient.commands.submit.execute({ ...recipient.input, operationId: randomUUID(), expectedPolicyVersion: 4 })).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      expect(await recipient.commands.submit.execute(submission)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: submitted.value.result } });
      const final = await database.withContext(fixture.own, async (transaction) => ({
        members: (await transaction.execute<{count: number}>(sql`select count(*)::integer as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows[0].count,
        requests: (await transaction.execute(sql`select id,status from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows,
        invitation: (await transaction.execute(sql`select status,version,redeemed_request_id,redeemed_by_user_id,redeemed_at::text from public.academy_personal_invitations where id=${created.result.invitationId}`)).rows[0],
        binding: (await transaction.execute(sql`select id,owner_user_id,first_request_id,first_proof_id,created_at::text from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${recipient.userId}`)).rows[0],
        effect: (await transaction.execute(sql`select applied_at is not null as applied,revoked_at is not null as revoked,revocation_reason,member_id from public.academy_admission_membership_effects where id=${original.member.admission_membership_effect_id}`)).rows[0],
      }));
      expect(final).toEqual({ members: 0, requests: [{ id: admissionRequestId, status: "approved" }], invitation: original.invitation, binding: original.binding, effect: { applied: true, revoked: true, revocation_reason: "membership_deleted", member_id: null } });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
