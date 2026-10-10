/** @vitest-environment node */
/** Exercises the actual module composition, native identity and leader metadata/commands without a direct repository caller. @module personal-invitation-composition-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal administration composition", () => {
  it("should resolve leader/session/recency and create/read/rename through real application use cases while replay remains token-free", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture } = await prepareAllowlistAdmission(database);
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId: fixture.sessionId }), (scope, run) => database.withContext({ userId: scope.userId, email: null }, run));
      const invitationModule = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createPersonalInvitationModule({ readSecurityConfig: async () => fixture.config });
      const input = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), confirmed: true as const, contactType: "email" as const, identity: " User.Name+tag@Example.Test ", internalName: " Grupo ", requiresAllowlist: false, allowlistExemptionAcknowledged: true };
      expect(await invitationModule.useCases.create(input)).toMatchObject({ ok: false, failure: { code: "reauthentication_required" } });
      await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation);
      const created = await invitationModule.useCases.create(input);
      expect(created).toMatchObject({ ok: true, value: { state: "completed", result: { version: 1 }, initialToken: expect.any(String) } });
      if (!created.ok || created.value.state !== "completed") throw new Error("Expected own module initial creation");
      const invitationId = created.value.result.invitationId;
      const replay = await invitationModule.useCases.create(input);
      expect(replay).toMatchObject({ ok: true, value: { state: "completed", replayed: true } });
      if (replay.ok) expect(replay.value).not.toHaveProperty("initialToken");
      expect(await invitationModule.useCases.list({ tribeId: fixture.tribeId, requestId: randomUUID(), limit: 10 })).toMatchObject({ ok: true, value: { items: [{ id: invitationId, version: 1, internalName: "Grupo", recipient: { type: "email", value: "user.name+tag@example.test" } }] } });
      await fixture.confirm(REAUTHENTICATION_OPERATION.renamePersonalInvitation, invitationId);
      expect(await invitationModule.useCases.rename({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), confirmed: true, invitationId, expectedVersion: 1, internalName: " Nuevo grupo " })).toMatchObject({ ok: true, value: { state: "completed", result: { version: 2, changed: true } } });
      expect(await invitationModule.useCases.read({ tribeId: fixture.tribeId, requestId: randomUUID(), invitationId })).toMatchObject({ ok: true, value: { id: invitationId, version: 2, internalName: "Nuevo grupo" } });
    });
  }, 1_200_000);
});
