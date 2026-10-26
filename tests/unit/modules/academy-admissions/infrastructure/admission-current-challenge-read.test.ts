/** @vitest-environment node */
/** Exercises exact owned retry selection through real account, policy, ledger and PostgreSQL without another send. @module admission-current-challenge-read-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("owned current contact challenge", () => {
  it("should select the exact current allowed SMS original under a WhatsApp policy without writes and reject stale retry authority", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, true), previousRequestId = randomUUID();
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,phone_channel='whatsapp',allow_sms_alternative=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
      });
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const issued = await operations.issue({ ...fixture.input, expectedPolicyVersion: 2 });
      if (issued.state !== "completed") throw new Error("Current contact fixture expected a committed SMS original");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,submitted_at,expires_at) select ${previousRequestId},${fixture.context.tribeId},${fixture.context.userId},'common','none',now-interval '3 days',now-interval '1 day' from instant`));
      const query = { ...fixture.context, previousRequestId, expectedPolicyVersion: 2, channel: "whatsapp" as const, contact: fixture.input.contact };
      const before = await fixture.counts();
      expect(await operations.readCurrent(query)).toMatchObject({ current: { operationId: fixture.input.operationId, requiresReplacement: false, challenge: { challengeId: issued.result.challengeId, channel: "sms", maskedDestination: "••••1234" } } });
      expect(await operations.readCurrent({ ...query, contact: { type: "phone", value: "+5491155505678", country: "AR" } })).toEqual({ current: null });
      await expect(operations.readCurrent({ ...query, previousRequestId: randomUUID() })).rejects.toMatchObject({ code: "request_conflict" });
      await expect(operations.readCurrent({ ...query, expectedPolicyVersion: 1 })).rejects.toMatchObject({ code: "policy_conflict" });
      await expect(operations.readCurrent({ ...query, userId: fixture.fixture.own.userId })).rejects.toMatchObject({ code: "permission_denied" });
      expect(await fixture.counts()).toEqual(before);
      const macPurpose = MESSAGING_KEY_PURPOSE.verificationMac, successorKeyId = randomUUID();
      const successorKey = await crypto.subtle.importKey("raw", randomBytes(MESSAGING_CRYPTO.keyBytes), { name: MESSAGING_CRYPTO.macAlgorithm, hash: MESSAGING_CRYPTO.macHash }, false, ["sign", "verify"]);
      const successorConfig = { ...fixture.fixture.config, keyrings: { ...fixture.fixture.config.keyrings, [macPurpose]: { purpose: macPurpose, activeKeyId: successorKeyId, keys: new Map([...fixture.fixture.config.keyrings[macPurpose].keys, [successorKeyId, successorKey]]) } } };
      const rotated = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => successorConfig);
      expect(await rotated.readCurrent(query)).toMatchObject({ current: { requiresReplacement: false } });
      const retiredConfig = { ...successorConfig, keyrings: { ...successorConfig.keyrings, [macPurpose]: { ...successorConfig.keyrings[macPurpose], keys: new Map([[successorKeyId, successorKey]]) } } };
      const retired = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => retiredConfig);
      expect(await retired.readCurrent(query)).toMatchObject({ current: { requiresReplacement: true } });
      expect(await fixture.counts()).toEqual(before);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_requests set retry_allowed_at=clock_timestamp()+interval '1 day',version=version+1 where id=${previousRequestId}`));
      await expect(operations.readCurrent(query)).rejects.toMatchObject({ code: "admission_ineligible" });
      const currentRequestId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        // Replace only this unreferenced test row; this is fixture preparation, not an application deletion contract.
        await transaction.execute(sql`delete from public.academy_admission_requests where id=${previousRequestId} and tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`);
        await transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,submitted_at,expires_at) select ${currentRequestId},${fixture.context.tribeId},${fixture.context.userId},'common','none',now,now+interval '30 days' from instant`);
      });
      await expect(operations.readCurrent({ ...query, previousRequestId: currentRequestId })).rejects.toMatchObject({ code: "request_conflict" });
      await expect(operations.readCurrent(query)).rejects.toMatchObject({ code: "request_conflict" });
      expect(await fixture.counts()).toEqual(before);
    });
  }, ADMISSION_LIMIT.verificationProofFreshnessMs);
});
