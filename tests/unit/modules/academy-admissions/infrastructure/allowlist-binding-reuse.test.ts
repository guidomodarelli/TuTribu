/** @vitest-environment node */
/** Exercises allowed reuse of an immutable owned contact binding without changing list configuration or old decisions. @module allowlist-binding-reuse-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native owned allowlist binding reuse", () => {
  it("should reuse the first owned binding after cancellation and authorized retry while preserving the enabled entry version and old source", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant, leader } = await prepareAllowlistAdmission(database), applicant = await createApplicant();
      const presented = await applicant.commands.submit.execute({ ...applicant.input, message: "Pido una revisión inicial." });
      if (!presented.ok || presented.value.state !== "completed" || !presented.value.result.admissionRequestId) throw new Error("Expected original owned exception");
      const requestId = presented.value.result.admissionRequestId, version = presented.value.result.committedRequestVersion!;
      const binding = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ id: string; first_request_id: string; created_at: string }>(sql`select id,first_request_id,created_at from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${applicant.userId}`)).rows[0]);
      expect(binding.first_request_id).toBe(requestId);
      const cancelled = await applicant.commands.cancelOwn.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: version, confirmed: true });
      expect(cancelled).toMatchObject({ ok: true, value: { state: "completed", result: { status: "cancelled", version: version + 1 } } });
      const creation = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      const entry = await fixture.writer.create({ context: creation, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: applicant.email }, displayName: "Configuración independiente" });
      if (entry.state !== "completed") throw new Error("Expected separately added list entry");
      await fixture.confirm(REAUTHENTICATION_OPERATION.advanceAdmissionRetry, requestId);
      expect(await leader.allowRetry.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: version + 1, confirmed: true, internalReason: "La presentación fue cancelada y el contacto ya está habilitado." })).toMatchObject({ ok: true, value: { state: "completed" } });
      const current = await applicant.commands.submit.execute({ ...applicant.input, operationId: randomUUID() });
      expect(current).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "admitted", membership: { role: "tribemate", status: "active" } } } });
      if (!current.ok || current.value.state !== "completed" || !current.value.result.admissionRequestId) throw new Error("Expected explicitly permitted new admission");
      const currentRequestId = current.value.result.admissionRequestId;
      expect(currentRequestId).not.toBe(requestId);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id,first_request_id,created_at from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${applicant.userId}`)).rows).toEqual([binding]);
        expect((await transaction.execute(sql`select binding_id from public.academy_admission_requests where id=${currentRequestId}`)).rows).toEqual([{ binding_id: binding.id }]);
        expect((await transaction.execute(sql`select status from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "cancelled" }]);
        expect((await transaction.execute(sql`select version,status,display_name from public.academy_allowlist_entries where id=${entry.result.entryId}`)).rows).toEqual([{ version: 1, status: "enabled", display_name: "Configuración independiente" }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}`)).rows).toEqual([{ count: 1 }]);
      });
    });
  }, 1_200_000);
});
