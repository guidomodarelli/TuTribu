/** @vitest-environment node */
/** Exercises account deletion against a real claimed contact before choosing its retention implementation. @module allowlist-binding-account-deletion-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { assertUnreservedAdmissionContact } from "@/src/modules/academy-admissions/infrastructure/repositories/assert-unreserved-admission-contact";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { randomBytes } from "node:crypto";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native bound-account deletion", () => {
  it("should remove the account while retaining a minimized identity reservation that cannot be claimed by another account", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), owner = await createApplicant();
      await database.applyMigration("20261010100000_minimize_deleted_admission_contact_owners.sql");
      const context = await fixture.confirm(REAUTHENTICATION_OPERATION.createAllowlistEntry);
      await fixture.writer.create({ context, operationId: randomUUID(), confirmed: true, contact: { type: "email", value: owner.email }, displayName: null });
      const submitted = await owner.commands.submit.execute(owner.input);
      expect(submitted.ok && submitted.value.state === "completed" && submitted.value.result.outcome === "admitted").toBe(true);
      const originalBinding = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ id: string; owner_reference_id: string }>(sql`select id,owner_reference_id from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows[0]);
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_contact_bindings set owner_user_id=null,normalized_contact=null,minimized_at=clock_timestamp() where id=${originalBinding.id}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      try { await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public."user" where id=${owner.userId}`)); }
      catch (error) {
        const cause = error instanceof Error && "cause" in error ? error.cause : error;
        const metadata = typeof cause === "object" && cause !== null ? cause as { code?: unknown; constraint?: unknown } : {};
        process.stdout.write(JSON.stringify({ phase: "bound_account_deletion", code: metadata.code, constraint: metadata.constraint }) + "\n");
        throw new Error("Bound account deletion failed before identity minimization", { cause: error });
      }
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as count from public."user" where id=${owner.userId}`)).rows).toEqual([{ count: 0 }]);
        const reservation = (await transaction.execute<{ minimized: boolean }>(sql`select id=${originalBinding.id} and owner_reference_id=${originalBinding.owner_reference_id} and normalized_contact is null and octet_length(contact_fingerprint)=32 and owner_user_id is null and minimized_at is not null and first_request_id is null and first_proof_id is null as minimized from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows;
        expect(reservation).toEqual([{ minimized: true }]);
        expect((await transaction.execute(sql`select actor_user_id is null and minimized_at is not null and public_result='{"minimized":true}'::jsonb as minimized from public.academy_admission_operations where idempotency_key=${owner.input.operationId}`)).rows).toEqual([{ minimized: true }]);
        expect((await transaction.execute(sql`select user_id is null and member_id is null and minimized_at is not null and revoked_at is not null as minimized from public.academy_admission_membership_effects where request_id=${submitted.ok && submitted.value.state === "completed" ? submitted.value.result.admissionRequestId : null}`)).rows).toEqual([{ minimized: true }]);
      });
      const claimant = await createApplicant(true, owner.email);
      const result = await claimant.commands.submit.execute(claimant.input);
      process.stdout.write(JSON.stringify({ phase: "minimized_contact_claim", code: result.ok ? null : result.failure.code }) + "\n");
      expect(result).toMatchObject({ ok: false, failure: { code: "contact_binding_conflict" } });
      await expect(database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_contact_bindings set owner_user_id=${claimant.userId},normalized_contact=${owner.email},minimized_at=null where id=${originalBinding.id}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      const ring = fixture.config.keyrings[MESSAGING_KEY_PURPOSE.contactFingerprint], nextKeyId = randomUUID();
      const nextKey = await crypto.subtle.importKey("raw", randomBytes(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
      const rotated = { ...fixture.config, keyrings: { ...fixture.config.keyrings, contact_fingerprint: { ...ring, activeKeyId: nextKeyId, keys: new Map([...ring.keys, [nextKeyId, nextKey]]) } } };
      await expect(database.withContext(fixture.own, (transaction) => assertUnreservedAdmissionContact(transaction, fixture.tribeId, { type: "email", value: owner.email }, async () => rotated))).rejects.toMatchObject({ code: "contact_binding_conflict" });
      await expect(database.withContext(fixture.own, (transaction) => assertUnreservedAdmissionContact(transaction, fixture.tribeId, { type: "email", value: "unrelated@example.test" }, async () => rotated))).resolves.toBeUndefined();
      const retired = { ...rotated, keyrings: { ...rotated.keyrings, contact_fingerprint: { ...rotated.keyrings.contact_fingerprint, keys: new Map([[nextKeyId, nextKey]]) } } };
      await expect(database.withContext(fixture.own, (transaction) => assertUnreservedAdmissionContact(transaction, fixture.tribeId, { type: "email", value: "unrelated@example.test" }, async () => retired))).rejects.toMatchObject({ code: "resource_unavailable" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${claimant.userId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 1 }]);
      });
    });
  }, 1_200_000);
});
