/** @vitest-environment node */
/** Exercises the native applicant SMS owner and the single country-policy source through real SQL and crypto. @module admission-phone-contact-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native applicant phone verification", () => {
  it("should issue one SMS, recover its original and verify locally after the allowed country is removed", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, true);
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
      });
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const contact = { type: "phone" as const, value: "+5491155501234", country: "AR" }, input = { ...fixture.input, contact, channel: "sms" as const, expectedPolicyVersion: 2 };
      const issued = await operations.issue(input);
      if (issued.state !== "completed") throw new Error("Native phone fixture expected a confirmed issuance");
      expect(issued.result).toMatchObject({ purpose: "admission", channel: "sms", maskedDestination: "••••1234", deliveryState: "queued" });
      expect(await operations.issue(input)).toEqual({ ...issued, replayed: true });
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact, verificationEpoch: 2 };
      const recovered = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.result.challengeId);
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.messaging_usage_policies set allowed_countries='{}',version=version+1 where tribe_id=${fixture.context.tribeId}`));
      const verification = { ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: recovered.code };
      const verified = await operations.verify(verification);
      expect(verified).toMatchObject({ state: "completed", result: { purpose: "admission", result: "verified", proofId: expect.any(String) } });
      expect(await operations.verify(verification)).toEqual({ ...verified, replayed: true });
      expect(await fixture.counts()).toMatchObject({ challenges: 1, deliveries: 1, events: 1, proofs: 1, memberships: 0 });
      const globalState = await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select "emailVerified" as verified,(select count(*)::int from public.session where "userId"=${fixture.context.userId}) as sessions from public."user" where id=${fixture.context.userId}`));
      expect(globalState.rows).toEqual([{ verified: false, sessions: 1 }]);
    });
  }, 600_000);

  it("should reject an SMS when the owner has no allowed countries without creating a challenge or consuming a send", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, true);
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      await expect(operations.issue({ ...fixture.input, contact: { type: "phone", value: "+5491155501234", country: "AR" }, channel: "sms", expectedPolicyVersion: 2 })).rejects.toMatchObject({ code: "recipient_not_allowed" });
      expect(await fixture.counts()).toMatchObject({ challenges: 0, deliveries: 0, events: 0, proofs: 0, memberships: 0 });
    });
  }, 600_000);
});
