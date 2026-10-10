/** @vitest-environment node */
/** Preserves exact stable-account redemption state after a native email update without authorizing a new recipient. @module personal-invitation-preview-account-change-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal preview stable account", () => {
  it("should retain the original redeemed pending after the same native account changes email and close the original link for another account", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), recipient = await createApplicant(), other = await createApplicant();
      for (const migration of ["20261009130000_add_personal_invitation_context_digest.sql", "20261007001000_read_public_admission_overview.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const invitations = new PostgresPersonalInvitationRepository((_scope, run) => database.withContext(fixture.own, run), async () => fixture.config);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await invitations.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, internalName: "Cuenta estable", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Expected native original personal link");
      const submitted = await recipient.commands.submit.execute({ ...recipient.input, expectedPolicyVersion: 3, invitationToken: created.initialToken });
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Expected native personal pending before account update");
      const requestId = submitted.value.result.admissionRequestId;
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public."user" set email=${`updated.${randomUUID()}@example.test`} where id=${recipient.userId}`));
      /** @param identity - Real current native account/session. @returns Own read-only preview with current account facts. */
      const preview = (identity: { userId: string; sessionId: string }) => {
        const accounts = new PostgresAuthenticatedAccountProvider(async () => identity, (scope, run) => database.withContext({ userId: scope.userId, email: null }, run));
        return buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createPersonalInvitationQueryModule({ readSecurityConfig: async () => fixture.config }).useCases.overview;
      };
      const query = { token: created.initialToken, requestId: randomUUID() };
      expect(await preview(recipient).execute(query)).toMatchObject({ ok: true, value: { state: "available", overview: { state: "pending", request: { id: requestId, source: "personal", version: 2 } } } });
      expect(await preview(other).execute(query)).toMatchObject({ ok: true, value: { state: "unavailable" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,redeemed_by_user_id,redeemed_request_id from public.academy_personal_invitations where id=${created.result.invitationId}`)).rows).toEqual([{ status: "redeemed", version: 2, redeemed_by_user_id: recipient.userId, redeemed_request_id: requestId }]);
        expect((await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "pending", version: 2 }]);
      });
    });
  }, 1_200_000);
});
