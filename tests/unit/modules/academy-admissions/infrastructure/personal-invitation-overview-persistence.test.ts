/** @vitest-environment node */
/** Exercises actual private token lookup and public preview projection with no lifecycle or code effects. @module personal-invitation-overview-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal invitation preview", () => {
  it("should read the exact recipient without effects, close forwarded or invalid tokens generically and observe current revocation without materializing state on reads", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), recipient = await createApplicant(), other = await createApplicant();
      for (const migration of ["20261009130000_add_personal_invitation_context_digest.sql", "20261007001000_read_public_admission_overview.sql"]) await database.applyMigration(migration);
      const invitations = new PostgresPersonalInvitationRepository((_scope, run) => database.withContext(fixture.own, run), async () => fixture.config);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await invitations.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, internalName: "Nombre privado de invitación", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Expected native token before preview");
      const invitationId = created.result.invitationId, token = created.initialToken;
      /** @param identity - Exact native account/session or public absence. @returns The actual query composition without a writer or issuer. */
      const preview = (identity: { userId: string; sessionId: string } | null) => {
        const accounts = new PostgresAuthenticatedAccountProvider(async () => identity, (scope, run) => database.withContext({ userId: scope.userId, email: null }, run));
        return buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createPersonalInvitationQueryModule({ readSecurityConfig: async () => fixture.config }).useCases.overview;
      };
      const query = { token, requestId: randomUUID() };
      expect(await preview(null).execute(query)).toMatchObject({ ok: true, value: { state: "sign_in_required" } });
      const allowed = await preview(recipient).execute(query);
      expect(allowed).toMatchObject({ ok: true, value: { state: "available", expectedOutcome: "admitted", requiresAllowlist: false, overview: { state: "available", policy: { version: 2 } } } });
      expect(JSON.stringify(allowed)).not.toContain(recipient.email); expect(JSON.stringify(allowed)).not.toContain(token); expect(JSON.stringify(allowed)).not.toContain("Nombre privado de invitación");
      const forwarded = await preview(other).execute(query), invalid = await preview(other).execute({ ...query, token: randomUUID() });
      expect(forwarded).toEqual(invalid); expect(forwarded).toMatchObject({ ok: true, value: { state: "unavailable" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "active", version: 1, redeemed_request_id: null }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}) as bindings,(select count(*)::int from public.contact_verification_challenges where tribe_id=${fixture.tribeId}) as challenges,(select count(*)::int from public.academy_admission_operations where actor_user_id in (${recipient.userId},${other.userId}) and tribe_id=${fixture.tribeId}) as operations`)).rows).toEqual([{ requests: 0, bindings: 0, challenges: 0, operations: 0 }]);
      });
      const revoke = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.revokePersonalInvitation, invitationId), action: "manage_invitations" as const };
      expect(await invitations.revoke({ context: revoke, operationId: randomUUID(), confirmed: true, invitationId, expectedVersion: 1, revokeRedeemedAuthorization: false, internalReason: "Retiro antes de confirmar" })).toMatchObject({ state: "completed", result: { version: 2 } });
      expect(await preview(recipient).execute(query)).toEqual(forwarded);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "revoked", version: 2 }]);
      });
    });
  }, 1_200_000);
});
