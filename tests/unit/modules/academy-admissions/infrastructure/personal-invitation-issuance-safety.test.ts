/** @vitest-environment node */
/** Exercises current native issuance policy and closes phone-OFF proposals without token or contact reservations. @module personal-invitation-issuance-safety-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistManagement } from "@/tests/support/allowlist-management-database-fixture";
import { PostgresPersonalInvitationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-personal-invitation-repository";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal invitation issuance safety", () => {
  it("should refuse phone issuance with additional verification OFF and never create an invitation, binding or request", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAllowlistManagement(database);
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set contact_type='phone',requires_additional_verification=false,version=version+1 where tribe_id=${fixture.tribeId}`));
      const context = { ...await fixture.confirm(REAUTHENTICATION_OPERATION.createPersonalInvitation), action: "manage_invitations" as const };
      const repository = new PostgresPersonalInvitationRepository((_context, run) => database.withContext(fixture.own, run), async () => fixture.config);
      const input = { context, operationId: randomUUID(), confirmed: true as const, contact: { type: "phone" as const, value: "+5491155501234", country: "AR" }, internalName: "Destinatario de teléfono", requiresAllowlist: false, allowlistExemptionAcknowledged: true };
      await expect(repository.create(input)).rejects.toMatchObject({ code: "invitation_unavailable", operationState: "completed", operationId: input.operationId });
      await expect(repository.create(input)).rejects.toMatchObject({ code: "invitation_unavailable", operationState: "completed" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_personal_invitations where tribe_id=${fixture.tribeId}) as invitations,(select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}) as bindings`)).rows).toEqual([{ invitations: 0, requests: 0, bindings: 0 }]);
        expect((await transaction.execute(sql`select state,public_result from public.academy_admission_operations where tribe_id=${fixture.tribeId} and idempotency_key=${input.operationId}`)).rows).toEqual([{ state: "completed", public_result: { outcome: "denied", code: "invitation_unavailable" } }]);
      });
    });
  }, 1_200_000);
});
