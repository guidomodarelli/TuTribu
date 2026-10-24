/** @vitest-environment node */
/** Exercises the immutable lifetime of each local channel using real SQL and protected historical challenge fixtures. @module contact-verification-channel-expiry-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase, seedContactVerificationChallenge, createContactVerificationWriter } from "@/tests/support/contact-verification-database-fixture";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("local verification channel expiry", () => {
  it.each(["email", "sms", "whatsapp"] as const)("should reject the correct expired %s code without consuming a failure or creating a proof", async (channel) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const currentTime = await database.withContext(fixture.own, async (transaction) => new Date((await transaction.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now));
      const challenge = await seedContactVerificationChallenge(database, fixture, "admission", new Date(currentTime.getTime() - 660_000), undefined, channel);
      const validate = () => database.withContext(fixture.own, (transaction) => createContactVerificationWriter(transaction, fixture).validate({ scope: challenge.scope, challengeId: challenge.challengeId, operationId: randomUUID(), code: challenge.code }));
      expect(await validate()).toEqual({ outcome: "denied", reason: "verification_challenge_expired" });
      expect(await validate()).toEqual({ outcome: "denied", reason: "verification_challenge_expired" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state,failed_attempts,verified_at,code_mac is not null as has_mac,expires_at-created_at=interval '10 minutes' as original_lifetime,expires_at<clock_timestamp() as expired from public.contact_verification_challenges where id=${challenge.challengeId}`)).rows).toEqual([{ state: "issued", failed_attempts: 0, verified_at: null, has_mac: true, original_lifetime: true, expired: true }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.messaging_usage_events where actor_user_id=${fixture.userId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_verification_proofs where user_id=${fixture.userId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select "emailVerified" as verified from public."user" where id=${fixture.userId}`)).rows).toEqual([{ verified: false }]);
      });
    });
  }, 180_000);
});
