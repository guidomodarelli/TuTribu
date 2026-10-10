/** @vitest-environment node */
/** Exercises reasoned ON exceptions with real local evidence and a later independent list entry. @module allowlist-local-proof-exception-review-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native ON allowlist exception review", () => {
  it.each([false, true])("should keep a reasoned phone=%s local-proof exception pending after later listing until explicit review", async (phone) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, phone);
      for (const migration of ["20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007030000_capture_admission_decision_evidence.sql", "20261009082000_capture_automatic_allowlist_authorization.sql"]) await database.applyMigration(migration);
      await database.applyMigration("20261007005000_read_admission_reviews.sql");
      await database.applyMigration("20261009083000_read_current_admission_review_evidence.sql");
      const leaderSessionId = randomUUID(), leaderAccountId = randomUUID(), leaderSubject = randomUUID();
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_admission_policies set mode='allowlist',allow_common_exceptions=true,requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        if (phone) await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=array['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values(${leaderAccountId},${fixture.fixture.userId},'google',${leaderSubject},clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values(${leaderSessionId},${fixture.fixture.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values(${leaderSessionId},${fixture.fixture.userId},${leaderAccountId},${leaderSubject},${fixture.fixture.own.email})`);
      });
      const verification = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const issued = await verification.issue({ ...fixture.input, expectedPolicyVersion: 2 });
      if (issued.state !== "completed") throw new Error("ON exception fixture failed: current_challenge_unavailable");
      const code = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope: { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 } }, issued.result.challengeId);
      const verified = await verification.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: code.code });
      if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("ON exception fixture failed: local_proof_unavailable");
      /** Uses the actual persisted session and account for each command. @param userId - Native actor. @param sessionId - Native actor's session. @returns Current application commands through the real account provider. */
      const commands = (userId: string, sessionId: string) => {
        const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId, sessionId }), (_identity, run) => database.withContext({ userId, email: null }, run));
        return buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.fixture.config }).useCases;
      };
      const applicant = commands(fixture.context.userId, fixture.context.sessionId);
      const input = { tribeId: fixture.context.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 2, confirmed: true as const, proofId: verified.result.proofId, ...(phone ? { phone: fixture.input.contact.value, country: "AR" } : {}) };
      expect(await applicant.submit.execute(input)).toMatchObject({ ok: false, failure: { code: "invalid_input" } });
      const submitted = await applicant.submit.execute({ ...input, operationId: randomUUID(), message: "Pido que revisen este ingreso comprobado." });
      expect(submitted).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", membership: null } } });
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("ON exception fixture failed: reasoned_pending_unavailable");
      const requestId = submitted.value.result.admissionRequestId, requestVersion = submitted.value.result.committedRequestVersion!;
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${input.proofId}`)).rows).toEqual([{ status: "applied", applied_request_id: requestId }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_contact_bindings where tribe_id=${input.tribeId} and owner_user_id=${fixture.context.userId}`)).rows).toEqual([{ total: 1 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.tribe_members where tribe_id=${input.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ total: 0 }]);
      });
      const entryId = randomUUID();
      await database.withContext(fixture.fixture.own, async (transaction) => {
        const fingerprint = await createAdmissionContactFingerprint(fixture.input.contact, fixture.fixture.config);
        await transaction.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,display_name,origin,created_by_user_id,updated_by_user_id) values(${entryId},${input.tribeId},${fixture.input.contact.type},${fixture.input.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},'Entrada posterior independiente','manual',${fixture.fixture.userId},${fixture.fixture.userId})`);
      });
      expect(await applicant.submit.execute({ ...input, operationId: randomUUID(), message: "Consulto mi pendiente después de la lista." })).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", admissionRequestId: requestId } } });
      const leader = commands(fixture.fixture.userId, leaderSessionId);
      const approved = await leader.decide.execute({ tribeId: input.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: requestId, expectedVersion: requestVersion, confirmed: true, decision: "approve", internalReason: "Excepción revisada con evidencia local vigente.", externalMessage: null });
      if (!approved.ok) throw new Error(`ON exception approval failed: code=${approved.failure.code}`);
      expect(approved).toMatchObject({ ok: true, value: { state: "completed", result: { status: "approved" } } });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,display_name from public.academy_allowlist_entries where id=${entryId}`)).rows).toEqual([{ status: "enabled", version: 1, display_name: "Entrada posterior independiente" }]);
        expect((await transaction.execute(sql`select actor_kind,allowlist_entry_id from public.academy_admission_decisions where request_id=${requestId}`)).rows).toEqual([{ actor_kind: "user", allowlist_entry_id: null }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.tribe_members where tribe_id=${input.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ total: 1 }]);
      });
    });
  }, 1_200_000);
});
