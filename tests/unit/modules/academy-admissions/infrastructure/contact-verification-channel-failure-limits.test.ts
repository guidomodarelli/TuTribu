/** @vitest-environment node */
/** Exercises cumulative failure and resend budgets for genuinely issued channels with real PostgreSQL and cryptography. @module contact-verification-channel-failure-limits-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationIssuer, recoverTestVerificationCode, advanceVerificationRequestCooldown } from "@/tests/support/contact-verification-issuance-fixture";
import { createContactVerificationWriter } from "@/tests/support/contact-verification-database-fixture";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("issued channel failure and resend limits", () => {
  it.each(["email", "sms", "whatsapp"] as const)("should invalidate the fifth %s failure and preserve the account budget after explicit resend", async (channel) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database, "admission", channel !== "email");
      fixture.scope.channel = channel;
      await database.withContext(fixture.own, async (transaction) => {
        if (channel !== "email") await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.scope.tribeId}`);
        if (channel === "whatsapp") await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,tested_at) values (${fixture.scope.tribeId},${fixture.scope.connectionId},1,'whatsapp','synthetic-whatsapp-sender','synthetic-otp-template','es','prepared',clock_timestamp(),clock_timestamp())`);
      });
      const issued = await fixture.issue();
      if (issued.state !== "completed" || issued.result.outcome !== "issued") throw new Error("Channel failure fixture failed: original_challenge_unavailable");
      const first = issued.result;
      const firstCode = await recoverTestVerificationCode(database, fixture, first.challengeId);
      const fail = (challengeId: string, correctCode: string, operationId = randomUUID()) => database.withContext(fixture.own, (transaction) => createContactVerificationWriter(transaction, fixture).validate({ scope: fixture.scope, challengeId, operationId, code: `${correctCode[0] === "0" ? "1" : "0"}${correctCode.slice(1)}` }));
      const replayId = randomUUID();
      expect(await fail(first.challengeId, firstCode.code, replayId)).toEqual({ outcome: "wrong_code" });
      expect(await fail(first.challengeId, firstCode.code, replayId)).toEqual({ outcome: "wrong_code" });
      for (let attempt = 0; attempt < 4; attempt += 1) expect(await fail(first.challengeId, firstCode.code)).toEqual({ outcome: "wrong_code" });
      expect(await database.withContext(fixture.own, (transaction) => createContactVerificationWriter(transaction, fixture).validate({ scope: fixture.scope, challengeId: first.challengeId, operationId: randomUUID(), code: firstCode.code }))).toEqual({ outcome: "denied", reason: "verification_challenge_unavailable" });
      expect(await fixture.issue(first.challengeId)).toMatchObject({ state: "completed", result: { outcome: "denied", code: "usage_limit_reached" } });
      await advanceVerificationRequestCooldown(database, fixture);
      const resent = await fixture.issue(first.challengeId);
      if (resent.state !== "completed" || resent.result.outcome !== "issued") throw new Error("Channel failure fixture failed: replacement_challenge_unavailable");
      const second = resent.result;
      const secondCode = await recoverTestVerificationCode(database, fixture, second.challengeId);
      for (let attempt = 0; attempt < 5; attempt += 1) expect(await fail(second.challengeId, secondCode.code)).toEqual({ outcome: "wrong_code" });
      await advanceVerificationRequestCooldown(database, fixture);
      const thirdIssue = await fixture.issue(second.challengeId);
      if (thirdIssue.state !== "completed" || thirdIssue.result.outcome !== "issued") throw new Error("Channel failure fixture failed: third_challenge_unavailable");
      const third = thirdIssue.result;
      const thirdCode = await recoverTestVerificationCode(database, fixture, third.challengeId);
      expect(await database.withContext(fixture.own, (transaction) => createContactVerificationWriter(transaction, fixture).validate({ scope: fixture.scope, challengeId: third.challengeId, operationId: randomUUID(), code: thirdCode.code }))).toEqual({ outcome: "denied", reason: "verification_account_rate_limited" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select failed_attempts,state,code_mac,code_envelope_id from public.contact_verification_challenges where id in (${first.challengeId},${second.challengeId})`)).rows).toEqual([{ failed_attempts: 5, state: "invalidated", code_mac: null, code_envelope_id: null }, { failed_attempts: 5, state: "invalidated", code_mac: null, code_envelope_id: null }]);
        expect((await transaction.execute(sql`select failed_attempts,state,code_mac is not null as mac_retained from public.contact_verification_challenges where id=${third.challengeId}`)).rows).toEqual([{ failed_attempts: 0, state: "issued", mac_retained: true }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.messaging_usage_events where actor_user_id=${fixture.userId} and event_type='code_failure'`)).rows).toEqual([{ total: 10 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.messaging_usage_events where actor_user_id=${fixture.userId} and event_type='code_request'`)).rows).toEqual([{ total: 3 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_verification_proofs where user_id=${fixture.userId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select "emailVerified" as verified from public."user" where id=${fixture.userId}`)).rows).toEqual([{ verified: false }]);
      });
    });
  }, 1_200_000);
});
