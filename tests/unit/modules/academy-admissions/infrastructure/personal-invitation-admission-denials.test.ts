/** @vitest-environment node */
/** Verifies required-list and OFF-evidence failures never consume a personal link or silently become a common exception. @module personal-invitation-admission-denials-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal admission denials", () => {
  it("should require the exact enabled entry even with exceptions ON, preserving the original denial before a separately confirmed eligible presentation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), recipient = await createApplicant();
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      const listContext = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      expect((await fixture.writer.create({ context: listContext, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: "another.listed@example.test" }, displayName: null })).state).toBe("completed");
      const invitations = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await invitations.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, internalName: "Destinatario sujeto a lista", requiresAllowlist: true, allowlistExemptionAcknowledged: false });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Expected exact required-list resource");
      const input = { ...recipient.input, invitationToken: created.initialToken, message: "La explicación no dispensa mi lista personal." };
      expect(await recipient.commands.submit.execute(input)).toMatchObject({ ok: false, failure: { code: "admission_ineligible", operation: { operationId: input.operationId, state: "completed" } } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${created.result.invitationId}`)).rows).toEqual([{ status: "active", version: 1 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ count: 0 }]);
      });
      const exact = await fixture.writer.create({ context: listContext, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, displayName: "Nombre orientativo" });
      if (exact.state !== "completed") throw new Error("Expected separate exact list entry");
      expect(await recipient.commands.submit.execute(input)).toMatchObject({ ok: false, failure: { code: "admission_ineligible", operation: { state: "completed" } } });
      expect(await recipient.commands.submit.execute({ ...input, operationId: randomUUID() })).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "admitted" } } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select actor_kind,allowlist_entry_id,allowlist_entry_version from public.academy_admission_decisions where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ actor_kind: "system", allowlist_entry_id: exact.result.entryId, allowlist_entry_version: 1 }]);
        expect((await transaction.execute(sql`select status,version from public.academy_allowlist_entries where id=${exact.result.entryId}`)).rows).toEqual([{ status: "enabled", version: 1 }]);
      });
    });
  }, 1_200_000);

  it("should refuse declared OFF identity without code effects and use the common path only after a separate explicit confirmation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), recipient = await createApplicant(false);
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      const invitations = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config);
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const created = await invitations.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: recipient.email }, internalName: "Identidad aún no comprobada", requiresAllowlist: false, allowlistExemptionAcknowledged: true });
      if (created.state !== "completed" || !created.initialToken) throw new Error("Expected personal link before declared-only presentation");
      expect(await recipient.commands.submit.execute({ ...recipient.input, invitationToken: created.initialToken, message: "Solicito ingresar." })).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select (select count(*)::int from public.contact_verification_challenges where tribe_id=${fixture.tribeId}) as challenges,(select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}) as requests,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${recipient.userId}) as bindings`)).rows).toEqual([{ challenges: 0, requests: 0, bindings: 0 }]);
      });
      expect(await recipient.commands.submit.execute({ ...recipient.input, operationId: randomUUID(), message: "Pido una revisión por la vía común." })).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", requestSnapshot: { source: "common" } } } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${created.result.invitationId}`)).rows).toEqual([{ status: "active", version: 1 }]);
        expect((await transaction.execute(sql`select source,evidence_source,binding_id,invitation_id from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ source: "common", evidence_source: "declared", binding_id: null, invitation_id: null }]);
      });
    });
  }, 1_200_000);
});
