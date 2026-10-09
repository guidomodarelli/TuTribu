/** @vitest-environment node */
/** Connects personal issue and verify to explicit manual submit through native module composition without provider RPC. @module personal-contact-submit-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalContactIssuance } from "@/tests/support/personal-contact-issuance-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal code to explicit submit", () => {
  it("should consume the actual personal-origin proof only at explicit canje and retain one manual pending with its original lineage", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, operations, invitationId, input, token } = await preparePersonalContactIssuance(database);
      for (const migration of ["20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql"]) await database.applyMigration(migration);
      const issued = await operations.issue(input);
      if (issued.state !== "completed") throw new Error("Expected native personal code before canje");
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 };
      const code = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.result.challengeId);
      const verified = await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: code.code });
      if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("Expected personal-origin local proof before submit");
      const proofId = verified.result.proofId;
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.userId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const submit = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.fixture.config }).useCases.submit;
      const command = { tribeId: fixture.context.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 2, confirmed: true as const, invitationToken: token.token, proofId }, result = await submit.execute(command);
      expect(result).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", created: true, membership: null } } });
      if (!result.ok || result.value.state !== "completed" || !result.value.result.admissionRequestId) throw new Error("Expected exact native personal pending");
      const requestId = result.value.result.admissionRequestId;
      expect(await submit.execute(command)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: result.value.result } });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select source,status,invitation_id,evidence_source,proof_id from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ source: "personal", status: "pending", invitation_id: invitationId, evidence_source: "local", proof_id: proofId }]);
        expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${proofId}`)).rows).toEqual([{ status: "applied", applied_request_id: requestId }]);
        expect((await transaction.execute(sql`select status,version,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", version: 2, redeemed_request_id: requestId }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ count: 0 }]);
      });
    });
  }, 1_200_000);
});
