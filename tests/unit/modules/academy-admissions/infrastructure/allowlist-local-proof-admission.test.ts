/** @vitest-environment node */
/** Exercises email/phone ON list admission with actual local proof consumption and no provider calls. @module allowlist-local-proof-admission-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native list ON proof admission", () => {
  for (const phone of [false, true]) it(`should atomically consume one ${phone ? "phone" : "email"} proof into system approval while preserving the enabled entry and original replay`, async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, phone), entryId = randomUUID();
      for (const migration of ["20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007030000_capture_admission_decision_evidence.sql", "20261009082000_capture_automatic_allowlist_authorization.sql"]) await database.applyMigration(migration);
      await database.applyMigration("20261010100000_minimize_deleted_admission_contact_owners.sql");
      await database.withContext(fixture.fixture.own, async (transaction) => {
        const fingerprint = await createAdmissionContactFingerprint(fixture.input.contact, fixture.fixture.config);
        await transaction.execute(sql`update public.academy_admission_policies set mode='allowlist',requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        if (phone) await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=array['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,display_name,origin,created_by_user_id,updated_by_user_id) values (${entryId},${fixture.context.tribeId},${fixture.input.contact.type},${fixture.input.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},'Entrada propia','manual',${fixture.fixture.userId},${fixture.fixture.userId})`);
      });
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const issued = await operations.issue({ ...fixture.input, expectedPolicyVersion: 2 });
      if (issued.state !== "completed") throw new Error("Expected native list code issuance");
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 }, code = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.result.challengeId);
      const verified = await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: code.code });
      if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("Expected native verified list proof");
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.userId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const commands = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.fixture.config }).useCases;
      const input = { tribeId: fixture.context.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 2, confirmed: true as const, proofId: verified.result.proofId, ...(phone ? { phone: fixture.input.contact.value, country: "AR" } : {}) };
      const submitted = await commands.submit.execute(input);
      expect(submitted).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "admitted", membership: { role: "tribemate", status: "active" } } } });
      expect(await commands.submit.execute(input)).toMatchObject({ ok: true, value: { state: "completed", replayed: true } });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${input.proofId}`)).rows).toEqual([{ status: "applied", applied_request_id: submitted.ok && submitted.value.state === "completed" ? submitted.value.result.admissionRequestId : null }]);
        expect((await transaction.execute(sql`select actor_kind,allowlist_entry_id,allowlist_entry_version from public.academy_admission_decisions where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ actor_kind: "system", allowlist_entry_id: entryId, allowlist_entry_version: 1 }]);
        expect((await transaction.execute(sql`select status,version from public.academy_allowlist_entries where id=${entryId}`)).rows).toEqual([{ status: "enabled", version: 1 }]);
        expect((await transaction.execute(sql`select event_type from public.academy_admission_notification_obligations where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ event_type: "approved" }]);
      });
      try { await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`delete from public."user" where id=${fixture.context.userId}`)); }
      catch (error) {
        const cause = error instanceof Error && "cause" in error ? error.cause : error;
        const metadata = typeof cause === "object" && cause !== null ? cause as { code?: unknown; constraint?: unknown } : {};
        process.stdout.write(JSON.stringify({ phase: "local_proof_account_deletion", phone, code: metadata.code, constraint: metadata.constraint }) + "\n");
        throw new Error("Locally verified account deletion failed before minimization", { cause: error });
      }
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as count from public."user" where id=${fixture.context.userId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select normalized_contact is null and owner_user_id is null and minimized_at is not null and first_request_id is null and first_proof_id is null as minimized from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ minimized: true }]);
        expect((await transaction.execute(sql`select status,version from public.academy_allowlist_entries where id=${entryId}`)).rows).toEqual([{ status: "enabled", version: 1 }]);
      });
    });
  }, 1_200_000);
});
