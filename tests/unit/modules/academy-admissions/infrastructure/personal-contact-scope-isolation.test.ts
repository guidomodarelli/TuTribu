/** @vitest-environment node */
/** Exercises genuine crossed native challenges beside an active personal invitation without consuming its token. @module personal-contact-scope-isolation-tests */
import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalContactIssuance } from "@/tests/support/personal-contact-issuance-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal contact scope isolation", () => {
  it.each(["email", "sms", "whatsapp"] as const)("should reject another genuine %s challenge without consuming a personal invitation or the current code", async (channel) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, operations, invitationId, input } = await preparePersonalContactIssuance(database, channel !== "email");
      const otherUserId = randomUUID(), otherSessionId = randomUUID(), otherAccountId = randomUUID(), otherSubject = randomUUID(), otherEmail = `${otherUserId}@example.test`;
      await database.withContext(fixture.fixture.own, async (transaction) => {
        if (channel === "whatsapp") {
          await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,tested_at) values (${fixture.context.tribeId},${fixture.fixture.scope.connectionId},1,'whatsapp','synthetic-whatsapp-sender','synthetic-otp-template','es','prepared',clock_timestamp(),clock_timestamp())`);
          await transaction.execute(sql`update public.academy_admission_policies set phone_channel='whatsapp',version=version+1 where tribe_id=${fixture.context.tribeId}`);
        }
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${otherUserId},'Synthetic personal scope account',${otherEmail},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${otherAccountId},${otherUserId},'google',${otherSubject},clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${otherSessionId},${otherUserId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${otherSessionId},${otherUserId},${otherAccountId},${otherSubject},${otherEmail})`);
      });
      const expectedPolicyVersion = channel === "whatsapp" ? 3 : 2;
      const issued = await operations.issue({ ...input, channel, expectedPolicyVersion });
      if (issued.state !== "completed") throw new Error("Personal scope isolation setup failed: original_challenge_unavailable");
      const original = issued.result;
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, channel, verificationEpoch: 2 };
      const ownCode = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, original.challengeId);
      const otherOwn = { userId: otherUserId, email: otherEmail };
      const otherOperations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(otherOwn, run), async () => fixture.fixture.config);
      const otherContact = channel === "email" ? { type: "email" as const, value: otherEmail } : fixture.input.contact;
      const otherIssued = await otherOperations.issue({ ...fixture.input, userId: otherUserId, sessionId: otherSessionId, contact: otherContact, channel, expectedPolicyVersion, operationId: randomUUID() });
      if (otherIssued.state !== "completed") throw new Error("Personal scope isolation setup failed: foreign_challenge_unavailable");
      const otherChallenge = otherIssued.result;
      const otherCode = await recoverTestVerificationCode(database, { ...fixture.fixture, own: otherOwn, scope: { ...scope, userId: otherUserId, contact: otherContact } }, otherChallenge.challengeId);
      const before = await fixture.counts();
      /** @param viewer - Exact native owner whose RLS context observes its own authentication rows. @returns A private comparison digest; assertions emit only booleans, never rows, cookies, tokens or digests. */
      const authenticationDigest = (viewer: { userId: string; email: string }) => database.withContext(viewer, async (transaction) => {
        const snapshot = (await transaction.execute<{ snapshot: string }>(sql`select jsonb_build_object('user',(select to_jsonb(auth_user) from public."user" auth_user where id=${viewer.userId}),'account',(select jsonb_agg(to_jsonb(auth_account) order by id) from public.account auth_account where "userId"=${viewer.userId}),'session',(select jsonb_agg(to_jsonb(auth_session) order by id) from public.session auth_session where "userId"=${viewer.userId}),'binding',(select jsonb_agg(to_jsonb(identity_binding) order by session_id) from public.global_session_identity_bindings identity_binding where user_id=${viewer.userId}),'evidence',(select jsonb_agg(to_jsonb(identity_evidence) order by id) from public.global_identity_evidence identity_evidence where user_id=${viewer.userId}))::text as snapshot`)).rows[0].snapshot;
        return createHash("sha256").update(snapshot).digest("hex");
      });
      const originalAuthentication = await authenticationDigest(fixture.own), otherAuthentication = await authenticationDigest(otherOwn);
      await expect(operations.verify({ ...fixture.context, challengeId: otherChallenge.challengeId, verificationCode: otherCode.code, operationId: randomUUID() })).rejects.toMatchObject({ code: "challenge_invalidated" });
      await expect(otherOperations.verify({ ...fixture.context, userId: otherUserId, sessionId: otherSessionId, challengeId: original.challengeId, verificationCode: ownCode.code, operationId: randomUUID() })).rejects.toMatchObject({ code: "challenge_invalidated" });
      expect(await fixture.counts()).toEqual(before);
      expect(await authenticationDigest(fixture.own) === originalAuthentication && await authenticationDigest(otherOwn) === otherAuthentication).toBe(true);
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,redeemed_request_id,redeemed_by_user_id,redeemed_at from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "active", version: 1, redeemed_request_id: null, redeemed_by_user_id: null, redeemed_at: null }]);
        expect((await transaction.execute(sql`select state,failed_attempts,verified_at from public.contact_verification_challenges where id in (${original.challengeId},${otherChallenge.challengeId})`)).rows).toEqual([{ state: "issued", failed_attempts: 0, verified_at: null }, { state: "issued", failed_attempts: 0, verified_at: null }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_verification_proofs where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ total: 0 }]);
      });
      expect(await operations.verify({ ...fixture.context, challengeId: original.challengeId, verificationCode: ownCode.code, operationId: randomUUID() })).toMatchObject({ state: "completed", result: { result: "verified", purpose: "admission" } });
      expect(await authenticationDigest(fixture.own) === originalAuthentication && await authenticationDigest(otherOwn) === otherAuthentication).toBe(true);
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "active", version: 1, redeemed_request_id: null }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.context.tribeId}) as requests,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId}) as bindings,(select count(*)::int from public.tribe_members where tribe_id=${fixture.context.tribeId} and role='tribemate') as members`)).rows).toEqual([{ requests: 0, bindings: 0, members: 0 }]);
        expect((await transaction.execute(sql`select "emailVerified" as verified from public."user" where id=${fixture.context.userId}`)).rows).toEqual([{ verified: false }]);
      });
    });
  }, 1_200_000);
});
