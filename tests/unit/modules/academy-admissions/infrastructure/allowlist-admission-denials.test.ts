/** @vitest-environment node */
/** Exercises exact native negative matching and durable contact ownership without provider RPC. @module allowlist-admission-denials-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native allowlist admission denials", () => {
  it("should reject unmatched, declared, disabled and forwarded identities without creating requests or access, preserving each original denial", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set allow_common_exceptions=false,version=version+1 where tribe_id=${fixture.tribeId}`));
      const missing = await createApplicant(), declared = await createApplicant(false), disabled = await createApplicant(), forwarded = await createApplicant();
      const context = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      const declaredEntry = await fixture.writer.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: declared.email }, displayName: "Nombre coincidente" });
      const disabledEntry = await fixture.writer.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: disabled.email }, displayName: null });
      expect(declaredEntry.state).toBe("completed");
      if (disabledEntry.state !== "completed") throw new Error("Expected own disabled fixture entry");
      const edit = await fixture.confirm(REAUTHENTICATION_OPERATION.updateAllowlistEntry, disabledEntry.result.entryId);
      expect(await fixture.writer.update({ context: edit, entryId: disabledEntry.result.entryId, operationId: randomUUID(), confirmed: true, expectedVersion: 1, patch: { status: "disabled" } })).toMatchObject({ state: "completed", result: { version: 2 } });
      expect((await fixture.writer.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: "another.identity@example.test" }, displayName: "Synthetic list applicant" })).state).toBe("completed");
      for (const applicant of [missing, declared, disabled, forwarded]) {
        const intent = { ...applicant.input, expectedPolicyVersion: 3 };
        expect(await applicant.commands.submit.execute(intent)).toMatchObject({ ok: false, failure: { code: "admission_ineligible", operation: { operationId: intent.operationId, state: "completed" } } });
        expect(await applicant.commands.submit.execute(intent)).toMatchObject({ ok: false, failure: { code: "admission_ineligible", operation: { operationId: intent.operationId, state: "completed" } } });
      }
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.tribeId}) as requests,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}) as bindings,(select count(*)::int from public.tribe_members where tribe_id=${fixture.tribeId} and role='tribemate') as members`)).rows).toEqual([{ requests: 0, bindings: 0, members: 0 }]);
        expect((await transaction.execute(sql`select status,version from public.academy_allowlist_entries where id=${disabledEntry.result.entryId}`)).rows).toEqual([{ status: "disabled", version: 2 }]);
      });
    });
  }, 1_200_000);

  it("should preserve the original owner and basic member after disabling its entry and reject another account that later controls the same email", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), owner = await createApplicant();
      const context = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      const created = await fixture.writer.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: owner.email }, displayName: null });
      if (created.state !== "completed") throw new Error("Expected original owner entry");
      expect(await owner.commands.submit.execute(owner.input)).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "admitted" } } });
      const disableContext = await fixture.confirm(REAUTHENTICATION_OPERATION.updateAllowlistEntry, created.result.entryId);
      expect(await fixture.writer.update({ context: disableContext, entryId: created.result.entryId, operationId: randomUUID(), confirmed: true, expectedVersion: 1, patch: { status: "disabled" } })).toMatchObject({ state: "completed", result: { version: 2 } });
      const contender = await createApplicant();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public."user" set email=${`changed.${randomUUID()}@example.test`} where id=${owner.userId}`);
        await transaction.execute(sql`update public."user" set email=${owner.email} where id=${contender.userId}`);
        // Native auth marks the old capture invalid on email change. The new
        // private capture belongs to the contender; it never transfers binding.
        await transaction.execute(sql`insert into public.global_identity_evidence(user_id,account_id,provider_id,provider_subject,normalized_email,email_verified_claim,hosted_domain,classification,issuer,audience,token_issued_at,token_expires_at,verified_at) values (${contender.userId},${contender.accountId},'google',${contender.subject},${owner.email},true,'example.test','workspace','https://accounts.google.com','synthetic-list-client',clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp())`);
      });
      const intent = { ...contender.input, message: "Solicito una excepción sin transferir contacto." };
      expect(await contender.commands.submit.execute(intent)).toMatchObject({ ok: false, failure: { code: "contact_binding_conflict", operation: { operationId: intent.operationId, state: "completed" } } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select owner_user_id from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId} and normalized_contact=${owner.email}`)).rows).toEqual([{ owner_user_id: owner.userId }]);
        expect((await transaction.execute(sql`select status from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${owner.userId}`)).rows).toEqual([{ status: "active" }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.tribeId} and user_id=${contender.userId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select status,version from public.academy_allowlist_entries where id=${created.result.entryId}`)).rows).toEqual([{ status: "disabled", version: 2 }]);
      });
    });
  }, 1_200_000);
});
