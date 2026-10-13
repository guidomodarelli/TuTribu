/** @vitest-environment node */
/** Exercises genuine issued challenges across purpose and challenge boundaries with real PostgreSQL and Web Crypto. @module contact-verification-purpose-isolation-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationIssuer, recoverTestVerificationCode, advanceVerificationRequestCooldown, contactVerificationIssuanceSnapshotSchema } from "@/tests/support/contact-verification-issuance-fixture";
import { createContactVerificationWriter } from "@/tests/support/contact-verification-database-fixture";
import { PostgresContactVerificationIssuer } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-contact-verification-issuer";
import { PostgresVerificationRequestBudget } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-request-budget";
import { PostgresMessagingContactBudgetRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-contact-budget-repository";
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("issued contact challenge and purpose isolation", () => {
  it.each(["email", "sms", "whatsapp"] as const)("should reject another genuine %s challenge or purpose and preserve both original local codes", async (channel) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database, "admission", channel !== "email");
      fixture.scope.channel = channel;
      await database.withContext(fixture.own, async (transaction) => {
        if (channel !== "email") await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.scope.tribeId}`);
        if (channel === "whatsapp") await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,tested_at) values (${fixture.scope.tribeId},${fixture.scope.connectionId},1,'whatsapp','synthetic-whatsapp-sender','synthetic-otp-template','es','prepared',clock_timestamp(),clock_timestamp())`);
      });
      const issued = await fixture.issue();
      if (issued.state !== "completed" || issued.result.outcome !== "issued") throw new Error("Purpose isolation setup failed: admission_challenge_unavailable");
      const admission = issued.result;
      const admissionCode = await recoverTestVerificationCode(database, fixture, admission.challengeId);
      await advanceVerificationRequestCooldown(database, fixture);
      const diagnosticScope: VerificationChallengeScope = { ...fixture.scope, purpose: "connection_diagnostic", verificationEpoch: null };
      const diagnosticOperationId = randomUUID();
      const diagnosticIssue = await fixture.ledger.run({ actorUserId: fixture.userId, tribeId: fixture.scope.tribeId, operationType: "issue_contact_challenge", idempotencyKey: diagnosticOperationId, intent: { purpose: "connection_diagnostic", contact: diagnosticScope.contact.value, channel, connectionId: diagnosticScope.connectionId, connectionVersion: 1 } }, contactVerificationIssuanceSnapshotSchema, async (transaction, ledgerId) => {
        const contacts = new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => fixture.config);
        const budget = new PostgresVerificationRequestBudget(transaction, async () => true, contacts);
        const issuer = new PostgresContactVerificationIssuer(transaction, async (_database, scope) => scope.userId === fixture.userId && scope.tribeId === fixture.scope.tribeId, async () => fixture.config, budget);
        const result = await issuer.issue({ scope: diagnosticScope, operationId: diagnosticOperationId, ledgerId, expectedCurrentChallengeId: null });
        return result.outcome === "issued" ? { ...result, expiresAt: result.expiresAt.toISOString(), resendAllowedAt: result.resendAllowedAt.toISOString() } : result;
      });
      if (diagnosticIssue.state !== "completed" || diagnosticIssue.result.outcome !== "issued" || !diagnosticIssue.result.diagnosticId) throw new Error("Purpose isolation setup failed: diagnostic_challenge_unavailable");
      const diagnostic = diagnosticIssue.result;
      const diagnosticCode = await recoverTestVerificationCode(database, { ...fixture, scope: diagnosticScope }, diagnostic.challengeId);
      const validate = (scope: VerificationChallengeScope, challengeId: string, code: string) => database.withContext(fixture.own, (transaction) => createContactVerificationWriter(transaction, fixture).validate({ scope, challengeId, code, operationId: randomUUID() }));
      // Change one protected scope at a time; both referenced resources were genuinely issued and remain usable.
      expect(await validate(fixture.scope, diagnostic.challengeId, diagnosticCode.code)).toMatchObject({ outcome: "denied", reason: "verification_scope_mismatch" });
      expect(await validate(diagnosticScope, admission.challengeId, admissionCode.code)).toMatchObject({ outcome: "denied", reason: "verification_scope_mismatch" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select purpose,state,failed_attempts,verified_at from public.contact_verification_challenges where id in (${admission.challengeId},${diagnostic.challengeId}) order by purpose`)).rows).toEqual([{ purpose: "admission", state: "issued", failed_attempts: 0, verified_at: null }, { purpose: "connection_diagnostic", state: "issued", failed_attempts: 0, verified_at: null }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_verification_proofs where user_id=${fixture.userId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.messaging_usage_events where actor_user_id=${fixture.userId} and event_type='code_failure'`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select outcome from public.messaging_connection_diagnostics where id=${diagnostic.diagnosticId}`)).rows).toEqual([{ outcome: "pending" }]);
      });
      expect(await validate(diagnosticScope, diagnostic.challengeId, diagnosticCode.code)).toMatchObject({ outcome: "verified", purpose: "connection_diagnostic", proofId: null });
      expect(await validate(fixture.scope, admission.challengeId, admissionCode.code)).toMatchObject({ outcome: "verified", purpose: "admission", proofId: expect.any(String) });
      await advanceVerificationRequestCooldown(database, fixture);
      const replacement = await fixture.issue(admission.challengeId);
      if (replacement.state !== "completed" || replacement.result.outcome !== "issued") throw new Error("Purpose isolation setup failed: replacement_challenge_unavailable");
      const replacementChallenge = replacement.result;
      const replacementCode = await recoverTestVerificationCode(database, fixture, replacementChallenge.challengeId);
      expect(await validate(fixture.scope, admission.challengeId, admissionCode.code)).toMatchObject({ outcome: "denied", reason: "verification_challenge_unavailable" });
      expect(await validate(fixture.scope, replacementChallenge.challengeId, replacementCode.code)).toMatchObject({ outcome: "verified", purpose: "admission", proofId: expect.any(String) });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select "emailVerified" as verified from public."user" where id=${fixture.userId}`)).rows).toEqual([{ verified: false }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.session where "userId"=${fixture.userId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_requests where user_id=${fixture.userId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.messaging_usage_events where actor_user_id=${fixture.userId} and event_type='code_request'`)).rows).toEqual([{ total: 3 }]);
        expect((await transaction.execute(sql`select failed_attempts,state from public.contact_verification_challenges where id=${replacementChallenge.challengeId}`)).rows).toEqual([{ failed_attempts: 0, state: "verified" }]);
      });
    });
  }, 1_200_000);
});
