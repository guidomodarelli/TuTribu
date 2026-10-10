/** @vitest-environment node */
/** Exercises real read-only management composition, exact-type availability and guarded lifecycle metadata on an owned branch. @module personal-invitation-management-page-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { loadPersonalInvitationManagementPageState } from "@/src/modules/academy-admissions/infrastructure/composition/personal-invitation-management-page";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native private management page reads", () => {
  it("should read actual same-type list availability and lifecycle dates without invoking the security or command ports", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261007001000_read_public_admission_overview.sql", "20261009130000_add_personal_invitation_context_digest.sql"]) await database.applyMigration(migration);
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId: fixture.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const admissions = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) });
      let securityReads = 0;
      const personal = admissions.createPersonalInvitationModule({ readSecurityConfig: async () => { securityReads += 1; return fixture.config; } });
      const routing = admissions.createQueryModule({ executePublic: (run) => database.withContext({ userId: null, email: null }, run), readRecoveryLock: async () => false });
      const page = personal.createPage(routing.useCases.resolveTribe, admissions.createPolicyQueryModule({ composePreparation: null }).useCases), input = { params: { slug: `allowlist-${fixture.tribeId}` }, query: {} };
      const absent = await loadPersonalInvitationManagementPageState(input, async () => page);
      expect(absent).toMatchObject({ kind: "ready", contactType: "email", hasUsableAllowlist: false, page: { items: [], nextCursor: null } });
      const repository = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config);
      const authority = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await repository.create({ context: authority, operationId: randomUUID(), confirmed: true, internalName: "Grupo inicial", contact: { type: "email", value: "recipient@example.test" }, requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed") throw new Error("Expected original fixture creation metadata");
      const listContext = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      await fixture.writer.create({ context: listContext, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: "recipient@example.test" }, displayName: "Grupo" });
      const available = await loadPersonalInvitationManagementPageState(input, async () => page);
      expect(available).toMatchObject({ kind: "ready", hasUsableAllowlist: true, page: { items: [{ id: created.result.invitationId, status: "active", createdAt: expect.any(String), redeemedAt: null, revokedAt: null, authorizationRevokedAt: null }] } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set contact_type='phone',version=version+1 where tribe_id=${fixture.tribeId}`));
      const otherType = await loadPersonalInvitationManagementPageState(input, async () => page);
      expect(otherType).toMatchObject({ kind: "ready", contactType: "phone", hasUsableAllowlist: false });
      expect(securityReads).toBe(0);
      expect(JSON.stringify(available)).not.toContain("initialToken"); expect(JSON.stringify(available)).not.toContain("invitationUrl");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      expect(await loadPersonalInvitationManagementPageState(input, async () => page)).toMatchObject({ kind: "unavailable", code: "permission_denied" });
      expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.tribeId}`))).rows).toEqual([{ count: 0 }]);
    });
  }, 360_000);
});
