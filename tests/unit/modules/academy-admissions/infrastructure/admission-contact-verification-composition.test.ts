/** @vitest-environment node */
/** Exercises the request factory with native identity and real issuance, recovery and post-commit focal context. @module admission-contact-verification-composition-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import type { AdmissionChallengeDispatchIntent } from "@/src/modules/academy-admissions/domain/repositories/admission-contact-verification";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission contact request composition", () => {
  it("should issue and recover through native request authority, derive focal work after commit and verify without another dispatch", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database);
      for (const migration of ["20261007002000_read_own_admission_operations.sql", "20261008220000_scope_admission_operation_recovery.sql"]) await database.applyMigration(migration);
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      let identity = { userId: fixture.context.userId, sessionId: fixture.context.sessionId }, transactions = 0, dispatches = 0;
      const accounts = new PostgresAuthenticatedAccountProvider(async () => identity, (current, run) => database.withContext({ userId: current.userId, email: null }, run));
      const admissionModule = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: async (account, run) => { transactions += 1; try { return await database.withContext({ userId: account.userId, email: account.normalizedEmail }, run); } finally { transactions -= 1; } } });
      /** The test supplies only the owning backend launch boundary; SQL/account/crypto collaborators remain real. */
      const request = admissionModule.createContactVerificationModule({ readSecurityConfig: async () => fixture.fixture.config, createDispatcher: (resolve) => ({ dispatch: async (intent: AdmissionChallengeDispatchIntent) => { expect(transactions).toBe(0); const resolved = await resolve(intent); expect(resolved.scope).toMatchObject({ purpose: "admission", applicantUserId: fixture.context.userId, contributingLeaderUserId: fixture.fixture.userId, tribeId: fixture.context.tribeId, challengeId: intent.challengeId }); dispatches += 1; } }) }).useCases;
      const input = { tribeId: fixture.context.tribeId, requestId: randomUUID(), operationId: fixture.input.operationId, expectedPolicyVersion: 2, confirmed: true as const, channel: "email" as const };
      const issued = await request.issue(input);
      expect(issued).toMatchObject({ ok: true, value: { state: "completed", replayed: false, result: { purpose: "admission", channel: "email" } } });
      if (!issued.ok || issued.value.state !== "completed") throw new Error("Expected committed request factory challenge");
      expect(await request.issue(input)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: issued.value.result } });
      const recovered = await admissionModule.createQueryModule({ executePublic: (run) => database.withContext({ userId: null, email: null }, run), readRecoveryLock: async () => false }).useCases.operation.execute(input);
      expect(recovered).toMatchObject({ ok: true, value: { type: "issue_contact_challenge", state: "completed", result: issued.value.result } });
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 };
      const code = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.value.result.challengeId);
      expect(await request.verify({ ...input, operationId: randomUUID(), challengeId: issued.value.result.challengeId, verificationCode: code.code })).toMatchObject({ ok: true, value: { state: "completed", result: { purpose: "admission", result: "verified" } } });
      expect(dispatches).toBe(1);
      identity = { ...identity, sessionId: randomUUID() };
      expect(await request.issue({ ...input, operationId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
      expect(dispatches).toBe(1);
      expect(await fixture.counts()).toMatchObject({ challenges: 1, deliveries: 1, events: 1, operations: 2, proofs: 1, memberships: 0 });
    });
  }, 600_000);
});
