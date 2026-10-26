/** @vitest-environment node */
/** Exercises WhatsApp-to-SMS replacement through the native owner with real account, SQL, crypto and cooldown. @module admission-whatsapp-alternative-tests */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native WhatsApp admission alternative", () => {
  it("should replace WhatsApp with explicitly allowed SMS at the same phone without resetting original request accounting", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, true);
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,template_id,template_language,state,checked_at,tested_at) values (${fixture.context.tribeId},${fixture.fixture.scope.connectionId},1,'whatsapp','synthetic-whatsapp-sender','synthetic-otp-template','es','prepared',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,phone_channel='whatsapp',allow_sms_alternative=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
      });
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const issued = await operations.issue({ ...fixture.input, channel: "whatsapp", expectedPolicyVersion: 2 });
      if (issued.state !== "completed") throw new Error("Native WhatsApp fixture expected a committed challenge");
      expect(issued.result).toMatchObject({ purpose: "admission", channel: "whatsapp", maskedDestination: "••••1234" });
      const whatsappScope = { ...fixture.fixture.scope, userId: fixture.context.userId, channel: "whatsapp" as const, verificationEpoch: 2 };
      const oldCode = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope: whatsappScope }, issued.result.challengeId);
      const remaining = Math.max(0, new Date(issued.result.resendAllowedAt).getTime() - Date.now());
      if (remaining > 0) await delay(remaining);
      const resendInput = { ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, useSmsAlternative: true as const };
      const replacement = await operations.resend(resendInput);
      if (replacement.state !== "completed") throw new Error("Native SMS alternative expected a committed replacement");
      expect(replacement.result).toMatchObject({ purpose: "admission", channel: "sms", maskedDestination: "••••1234" });
      expect(await operations.resend(resendInput)).toEqual({ ...replacement, replayed: true });
      const lineage = await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select channel,state,is_current,normalized_contact=${fixture.input.contact.value} as same_contact from public.contact_verification_challenges where user_id=${fixture.context.userId} and tribe_id=${fixture.context.tribeId} order by created_at`));
      expect(lineage.rows).toEqual([{ channel: "whatsapp", state: "invalidated", is_current: false, same_contact: true }, { channel: "sms", state: "issued", is_current: true, same_contact: true }]);
      expect(await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: oldCode.code })).toMatchObject({ state: "completed", result: { result: "denied", code: "challenge_invalidated" } });
      const newCode = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope: { ...whatsappScope, channel: "sms" as const } }, replacement.result.challengeId);
      expect(await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: replacement.result.challengeId, verificationCode: newCode.code })).toMatchObject({ state: "completed", result: { result: "verified", proofId: expect.any(String) } });
      const requests = await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select count(*)::int as count,count(distinct contact_subject_id)::int as subjects from public.messaging_usage_events where tribe_id=${fixture.context.tribeId} and actor_user_id=${fixture.context.userId} and event_type='code_request'`));
      expect(requests.rows).toEqual([{ count: 2, subjects: 1 }]);
      expect(await fixture.counts()).toMatchObject({ challenges: 2, deliveries: 2, proofs: 1, memberships: 0 });
    });
  }, 600_000);
});
