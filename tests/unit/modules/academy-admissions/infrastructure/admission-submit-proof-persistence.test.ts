/** @vitest-environment node */
/** Exercises proof consumption in the initial common submission transaction through native application composition. @module admission-submit-proof-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native initial common submission with proof", () => {
  it("should consume one own fresh proof and bind contact with the initial pending commit, replaying without another request, binding or membership", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database);
      for (const migration of ["20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const issued = await operations.issue({ ...fixture.input, expectedPolicyVersion: 2 });
      if (issued.state !== "completed") throw new Error("Expected current applicant code");
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 }, code = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.result.challengeId);
      const verified = await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: code.code });
      if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("Expected original available admission proof");
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.userId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      let loseCommit = true;
      const request = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: async (account, run) => { const value = await database.withContext({ userId: account.userId, email: account.normalizedEmail }, run); if (loseCommit && typeof value === "object" && value !== null && "state" in value && value.state === "completed" && "replayed" in value && value.replayed === false) { loseCommit = false; throw new Error("Synthetic initial proof submission COMMIT response lost"); } return value; } }).createManualRequestModule({ readSecurityConfig: async () => fixture.fixture.config }).useCases;
      const input = { tribeId: fixture.context.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 2, confirmed: true as const, proofId: verified.result.proofId };
      const submitted = await request.submit.execute(input);
      expect(submitted).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", created: true, membership: null } } });
      expect(loseCommit).toBe(false);
      if (!submitted.ok || submitted.value.state !== "completed" || !submitted.value.result.admissionRequestId) throw new Error("Expected initial pending from own proof");
      const admissionRequestId = submitted.value.result.admissionRequestId;
      expect(await request.submit.execute(input)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: submitted.value.result } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${input.proofId}`)).rows).toEqual([{ status: "applied", applied_request_id: admissionRequestId }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId} and owner_user_id=${fixture.context.userId}`)).rows).toEqual([{ count: 1 }]);
      });
      expect(await fixture.counts()).toMatchObject({ proofs: 1, memberships: 0, challenges: 1, deliveries: 1, events: 1 });
    });
  }, 600_000);
});
