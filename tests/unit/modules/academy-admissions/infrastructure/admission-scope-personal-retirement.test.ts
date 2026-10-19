/** @vitest-environment node */
/** Exercises a real consumed personal invitation across academy exit and return without restoring authority. @module admission-scope-personal-retirement-tests */
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
import { PostgresTribeLifecycleRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-lifecycle-repository";
import { ManageTribeLifecycleUseCases } from "@/src/modules/tribes/application/use-cases/manage-tribe-lifecycle-use-cases";
import { createAdmissionScopeClosureWriter } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal admission scope closure", () => {
  it("should preserve actual consumed attribution and binding while preventing new use after academy exit and return", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database);
      for (const migration of ["20261007004000_read_exact_own_admission_request.sql", "20261009130000_add_personal_invitation_context_digest.sql", "20261006180000_guard_subscription_membership_sources.sql", "20261007020000_resolve_paid_admission_requests.sql", "20261007023000_close_unavailable_admission_requests.sql", "20261011223000_close_admission_scope_lifecycle.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const recipient = await createApplicant();
      const invitations = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config, createPostgresAdmissionNotificationObligationWriter);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await invitations.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, internalName: "Canje antes de salir de academia", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Synthetic personal retirement failed: initial token unavailable");
      const submission = { ...recipient.input, expectedPolicyVersion: 3, invitationToken: created.initialToken };
      const submitted = await recipient.commands.submit.execute(submission);
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Synthetic personal retirement failed: actual pending unavailable");
      const requestId = submitted.value.result.admissionRequestId;
      /** @returns Minimal consumed attribution and binding metadata, never bearer/contact material. */
      const snapshot = () => database.withContext(fixture.own, async (transaction) => ({
        consumed: (await transaction.execute(sql`select status,redeemed_request_id,redeemed_by_user_id,redeemed_at::text from public.academy_personal_invitations where id=${created.result.invitationId}`)).rows[0],
        binding: (await transaction.execute(sql`select id,owner_user_id,first_request_id,first_proof_id,created_at::text from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${recipient.userId}`)).rows[0],
      }));
      const before = await snapshot();
      expect(before.consumed).toMatchObject({ status: "redeemed", redeemed_request_id: requestId, redeemed_by_user_id: recipient.userId });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_academy_settings set admission_enabled=false where tribe_id=${fixture.tribeId}`));
      const pausedRead = await recipient.commands.own.getOwn({ tribeId: fixture.tribeId, requestId: randomUUID(), admissionRequestId: requestId });
      if (!pausedRead.ok) {
        const diagnostics: string[] = [pausedRead.failure.code];
        let current: unknown = pausedRead.failure.cause;
        while (current && typeof current === "object") {
          if ("code" in current && typeof current.code === "string") diagnostics.push(current.code);
          if ("message" in current && typeof current.message === "string") {
            const missingResource = /(?:function|column) "?([a-z_][a-z_.]*)/.exec(current.message);
            if (missingResource) diagnostics.push(missingResource[1]);
          }
          current = "cause" in current ? current.cause : null;
        }
        throw new Error(`Native paused own query failed: ${diagnostics.join("/")}`, { cause: pausedRead.failure.cause });
      }
      expect(pausedRead).toMatchObject({ ok: true, value: { status: "pending" } });
      const pausedApplicant = await createApplicant();
      expect(await pausedApplicant.commands.submit.execute({ ...pausedApplicant.input, expectedPolicyVersion: 3 })).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      expect(await snapshot()).toEqual(before);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_academy_settings set admission_enabled=true where tribe_id=${fixture.tribeId}`));
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId: fixture.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const lifecycle = new ManageTribeLifecycleUseCases(accounts, new PostgresTribeLifecycleRepository((_scope, run) => database.withContext(fixture.own, run), async () => fixture.config, createAdmissionScopeClosureWriter));
      const settings = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{config_version: number}>(sql`select config_version from public.tribe_academy_settings where tribe_id=${fixture.tribeId}`)).rows[0]);
      expect(await lifecycle.change({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), action: "exit_academy", expectedConfigVersion: settings.config_version, confirmed: true })).toMatchObject({ state: "completed", result: { accessModel: "legacy" } });
      expect(await snapshot()).toEqual(before);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,cancel_reason from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "cancelled", cancel_reason: "academy_unavailable" }]);
        expect((await transaction.execute(sql`select authorization_revoked_at is not null as revoked from public.academy_personal_invitations where id=${created.result.invitationId}`)).rows).toEqual([{ revoked: true }]);
        await transaction.execute(sql`update public.tribe_academy_settings set access_model='academy',admission_enabled=true where tribe_id=${fixture.tribeId}`);
      });
      expect(await recipient.commands.submit.execute({ ...submission, operationId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      expect(await recipient.commands.submit.execute(submission)).toMatchObject({ ok: true, value: { state: "completed", replayed: true } });
      expect(await snapshot()).toEqual(before);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::integer as total from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select status from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "cancelled" }]);
        expect((await transaction.execute(sql`select admissions_control_activated_at is not null as protected from public.tribes where id=${fixture.tribeId}`)).rows).toEqual([{ protected: true }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);
});
