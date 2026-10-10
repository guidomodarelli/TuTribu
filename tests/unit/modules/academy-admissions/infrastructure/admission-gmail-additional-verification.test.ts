/** @vitest-environment node */
/** Keeps a current trusted Gmail capture separate from the academy's required local proof. @module admission-gmail-additional-verification-tests */
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

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native trusted Gmail with additional verification ON", () => {
  it("should require local proof even for the current trusted base capture before admitting the exact enabled contact", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const email = `synthetic.${randomUUID()}+tag@gmail.com`, fixture = await prepareAdmissionContactVerification(database, false, undefined, false, email), evidenceId = randomUUID(), entryId = randomUUID();
      for (const migration of ["20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007030000_capture_admission_decision_evidence.sql", "20261009082000_capture_automatic_allowlist_authorization.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own, async (transaction) => {
        const account = (await transaction.execute<{ id: string; subject: string }>(sql`select id,"accountId" as subject from public.account where "userId"=${fixture.context.userId} and "providerId"='google'`)).rows[0];
        if (!account) throw new Error("Admission Gmail verification failed: linked_account_unavailable");
        await transaction.execute(sql`insert into public.global_identity_evidence(id,user_id,account_id,provider_id,provider_subject,normalized_email,email_verified_claim,classification,issuer,audience,token_issued_at,token_expires_at,verified_at) values (${evidenceId},${fixture.context.userId},${account.id},'google',${account.subject},${email},true,'gmail','https://accounts.google.com','synthetic-gmail-client',clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp())`);
        await transaction.execute(sql`update public.academy_admission_policies set mode='allowlist',requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        const fingerprint = await createAdmissionContactFingerprint(fixture.input.contact, fixture.fixture.config);
        await transaction.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,origin,created_by_user_id,updated_by_user_id) values (${entryId},${fixture.context.tribeId},'email',${email},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},'manual',${fixture.fixture.userId},${fixture.fixture.userId})`);
      });
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.userId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      expect(await accounts.getAuthenticatedAccount()).toMatchObject({ userId: fixture.context.userId, normalizedEmail: email, identityEvidence: { id: evidenceId, classification: "gmail", invalidatedAt: null } });
      const commands = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.fixture.config }).useCases;
      const submission = { tribeId: fixture.context.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 2, confirmed: true as const };
      expect(await commands.submit.execute(submission)).toMatchObject({ ok: false, failure: { code: "additional_verification_required" } });
      expect(await fixture.counts()).toMatchObject({ challenges: 0, deliveries: 0, events: 0, proofs: 0, memberships: 0 });
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const issued = await operations.issue({ ...fixture.input, expectedPolicyVersion: 2 });
      if (issued.state !== "completed") throw new Error("Admission Gmail verification failed: local_challenge_unavailable");
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 };
      const code = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.result.challengeId);
      const verified = await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: code.code });
      if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("Admission Gmail verification failed: local_proof_unavailable");
      expect(await commands.submit.execute({ ...submission, operationId: randomUUID(), proofId: verified.result.proofId })).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "admitted", membership: { role: "tribemate", status: "active" } } } });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select evidence_source from public.academy_admission_requests where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ evidence_source: "local" }]);
        expect((await transaction.execute(sql`select status,version from public.academy_allowlist_entries where id=${entryId}`)).rows).toEqual([{ status: "enabled", version: 1 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.global_identity_evidence where user_id=${fixture.context.userId}`)).rows).toEqual([{ count: 1 }]);
      });
    });
  }, 1_200_000);
});
