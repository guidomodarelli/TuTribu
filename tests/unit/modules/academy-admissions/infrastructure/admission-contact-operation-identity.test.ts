/** @vitest-environment node */
/** Exercises canonical UUID replay through actual HTTP guards and the native SQL operation fingerprint. @module admission-contact-operation-identity-tests */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { createAdmissionContactVerificationHandlers } from "@/src/modules/academy-admissions/infrastructure/api/admission-contact-verification-handlers";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("canonical native contact operation identity", () => {
  it("should recover the same uppercase and lowercase issue, verify and resend without duplicate codes, failure events or dispatches", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database);
      await database.applyMigration("20261007001000_read_public_admission_overview.sql");
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.userId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const admissionModule = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) });
      let dispatches = 0;
      const verification = admissionModule.createContactVerificationModule({ readSecurityConfig: async () => fixture.fixture.config, createDispatcher: (resolve) => ({ dispatch: async (intent) => { await resolve(intent); dispatches += 1; } }) }).useCases;
      const routing = admissionModule.createQueryModule({ executePublic: (run) => database.withContext({ userId: null, email: null }, run), readRecoveryLock: async () => false }).useCases;
      const handlers = createAdmissionContactVerificationHandlers(async () => ({ verification, resolveTribe: routing.resolveTribe })), slug = `issue-${fixture.context.tribeId}`;
      /** @param body - Original proposed JSON before the real boundary guard. @returns Native own request; only the launch port is observed without provider transport. */
      const request = (body: unknown) => new Request(`https://tutribu.example.invalid/api/tribes/${slug}/admissions/challenges`, { method: "POST", headers: { origin: "https://tutribu.example.invalid", "content-type": "application/json" }, body: JSON.stringify(body) });
      const issueId = randomUUID(), body = { operationId: issueId.toUpperCase(), confirmed: true, expectedPolicyVersion: 2, channel: "email" };
      const first = await handlers.issue(request(body), { params: Promise.resolve({ slug }) }), original = await first.json();
      expect(first.status).toBe(201);
      const replay = await handlers.issue(request({ ...body, operationId: issueId }), { params: Promise.resolve({ slug }) });
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual({ ...original, replayed: true });
      const challengeId = String(original.result.challengeId), challengeContext = { params: Promise.resolve({ slug, challengeId: challengeId.toUpperCase() }) };
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 }, recovered = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, challengeId);
      const verifyId = randomUUID(), verificationBody = { operationId: verifyId.toUpperCase(), confirmed: true, verificationCode: recovered.code === "000000" ? "111111" : "000000" };
      expect((await handlers.verify(request(verificationBody), challengeContext)).status).toBe(422);
      expect((await handlers.verify(request({ ...verificationBody, operationId: verifyId }), { params: Promise.resolve({ slug, challengeId }) })).status).toBe(422);
      const clock = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ now: Date | string; created_at: Date | string }>(sql`select clock_timestamp() as now,created_at from public.contact_verification_challenges where id=${challengeId}`)).rows[0]);
      const waitMs = Math.max(0, new Date(clock.created_at).getTime() + ADMISSION_LIMIT.verificationResendWaitMs - new Date(clock.now).getTime());
      if (waitMs > 0) await delay(waitMs);
      const resendId = randomUUID(), resendBody = { operationId: resendId.toUpperCase(), confirmed: true };
      const replacement = await handlers.resend(request(resendBody), challengeContext), replacementBody = await replacement.json();
      expect(replacement.status).toBe(201);
      const replacementReplay = await handlers.resend(request({ ...resendBody, operationId: resendId }), { params: Promise.resolve({ slug, challengeId }) });
      expect(replacementReplay.status).toBe(200);
      expect(await replacementReplay.json()).toEqual({ ...replacementBody, replayed: true });
      expect(dispatches).toBe(2);
      expect(await fixture.counts()).toMatchObject({ challenges: 2, deliveries: 2, events: 3, operations: 3, proofs: 0, memberships: 0 });
    });
  }, 900_000);
});
