/** @vitest-environment node */
/** Exercises explicit exception review without rewriting list authorization or contact ownership. @module allowlist-exception-review-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native explicit allowlist exception", () => {
  it("should create a reasoned pending, keep it pending after a later list entry and approve only by an explicit authorized reviewer without editing the entry", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant, leader } = await prepareAllowlistAdmission(database), applicant = await createApplicant();
      const submitted = await applicant.commands.submit.execute({ ...applicant.input, message: "Pido que revisen mi ingreso." });
      expect(submitted).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", membership: null } } });
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Expected own exception pending");
      const requestId = submitted.value.result.admissionRequestId, version = submitted.value.result.committedRequestVersion!;
      const creation = await fixture.confirm("create_allowlist_entry"), entry = await fixture.writer.create({ context: creation, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: applicant.email }, displayName: "Lista independiente" });
      if (entry.state !== "completed") throw new Error("Expected later list entry");
      const stillPending = await applicant.commands.submit.execute({ ...applicant.input, operationId: randomUUID() });
      expect(stillPending).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", admissionRequestId: requestId } } });
      const approved = await leader.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: version, confirmed: true, decision: "approve", internalReason: "Excepción revisada por el responsable.", externalMessage: null });
      expect(approved).toMatchObject({ ok: true, value: { state: "completed", result: { status: "approved" } } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select version,status,display_name from public.academy_allowlist_entries where id=${entry.result.entryId}`)).rows).toEqual([{ version: 1, status: "enabled", display_name: "Lista independiente" }]);
        expect((await transaction.execute(sql`select actor_kind,actor_user_id from public.academy_admission_decisions where request_id=${requestId}`)).rows).toEqual([{ actor_kind: "user", actor_user_id: fixture.userId }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${applicant.userId}`)).rows).toEqual([{ count: 1 }]);
      });
    });
  }, 1_200_000);

  it("should allow reasoned explicit OFF exception review with declared identity and close an original revoked capture once exceptions are disabled", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant, leader } = await prepareAllowlistAdmission(database);
      const declared = await createApplicant(false);
      expect(await declared.commands.submit.execute(declared.input)).toMatchObject({ ok: false, failure: { code: "invalid_input" } });
      const presented = await declared.commands.submit.execute({ ...declared.input, operationId: randomUUID(), message: "Explico mi pedido de excepción." });
      if (!presented.ok || presented.value.state !== "completed" || !presented.value.result.admissionRequestId) throw new Error("Expected reasoned declared exception");
      const declaredRequestId = presented.value.result.admissionRequestId;
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select evidence_source,binding_id from public.academy_admission_requests where id=${declaredRequestId}`)).rows).toEqual([{ evidence_source: "declared", binding_id: null }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${declared.userId}`)).rows).toEqual([{ count: 0 }]);
      });
      expect(await leader.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: declaredRequestId, expectedVersion: presented.value.result.committedRequestVersion!, confirmed: true, decision: "approve", internalReason: "Acepto el pedido tras revisión explícita.", externalMessage: null })).toMatchObject({ ok: true, value: { state: "completed", result: { status: "approved" } } });
      const trusted = await createApplicant();
      const pending = await trusted.commands.submit.execute({ ...trusted.input, message: "Solicito revisión antes del cambio." });
      if (!pending.ok || pending.value.state !== "completed" || !pending.value.result.admissionRequestId) throw new Error("Expected original trusted pending");
      const trustedRequestId = pending.value.result.admissionRequestId;
      const context = await fixture.confirm("create_allowlist_entry");
      expect((await fixture.writer.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: trusted.email }, displayName: null })).state).toBe("completed");
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.global_identity_evidence set invalidated_at=clock_timestamp(),invalidation_reason='superseded_capture' where id=${trusted.evidenceId}`);
        await transaction.execute(sql`update public.academy_admission_policies set allow_common_exceptions=false,version=version+1 where tribe_id=${fixture.tribeId}`);
      });
      expect(await leader.decide.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: trustedRequestId, expectedVersion: pending.value.result.committedRequestVersion!, confirmed: true, decision: "approve", internalReason: "Intento de revisión tras revocación.", externalMessage: null })).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status from public.academy_admission_requests where id=${trustedRequestId}`)).rows).toEqual([{ status: "pending" }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${trusted.userId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and owner_user_id=${declared.userId}`)).rows).toEqual([{ count: 0 }]);
      });
    });
  }, 1_200_000);
});
