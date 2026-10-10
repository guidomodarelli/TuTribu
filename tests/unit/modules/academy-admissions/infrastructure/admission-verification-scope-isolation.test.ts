/** @vitest-environment node */
/** Exercises native account, tribe and challenge isolation without replacing authentication or local crypto. @module admission-verification-scope-isolation-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission verification scope isolation", () => {
  it("should reject a genuine code through another account, tribe or challenge without consuming it or changing global authentication", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database), otherUserId = randomUUID(), otherSessionId = randomUUID(), otherAccountId = randomUUID(), otherTribeId = randomUUID(), otherEmail = `${otherUserId}@example.test`;
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${otherUserId},'Synthetic isolated code account',${otherEmail},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${otherAccountId},${otherUserId},'google',${randomUUID()},clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${otherSessionId},${otherUserId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${otherTribeId},'Synthetic isolated code tribe',${`scope-${otherTribeId}`},${fixture.fixture.userId})`);
        await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${otherTribeId},'academy',true)`);
        const now = (await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now;
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,requires_additional_verification,is_open,activated_at) values (${otherTribeId},true,true,${now})`);
        await transaction.execute(sql`update public.tribes set admissions_control_activated_at=${now} where id=${otherTribeId}`);
      });
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const issued = await operations.issue({ ...fixture.input, expectedPolicyVersion: 2 });
      if (issued.state !== "completed") throw new Error("Admission scope isolation failed: original_challenge_unavailable");
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 };
      const code = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.result.challengeId);
      const otherOperations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext({ userId: otherUserId, email: otherEmail }, run), async () => fixture.fixture.config);
      const original = { ...fixture.context, challengeId: issued.result.challengeId, verificationCode: code.code };
      const before = await fixture.counts();
      await expect(otherOperations.verify({ ...original, userId: otherUserId, sessionId: otherSessionId, operationId: randomUUID() })).rejects.toMatchObject({ code: "challenge_invalidated" });
      await expect(otherOperations.resend({ ...fixture.context, userId: otherUserId, sessionId: otherSessionId, challengeId: issued.result.challengeId, operationId: randomUUID() })).rejects.toMatchObject({ code: "challenge_invalidated" });
      await expect(operations.verify({ ...original, tribeId: otherTribeId, operationId: randomUUID() })).rejects.toMatchObject({ code: "challenge_invalidated" });
      await expect(operations.resend({ ...fixture.context, tribeId: otherTribeId, challengeId: issued.result.challengeId, operationId: randomUUID() })).rejects.toMatchObject({ code: "challenge_invalidated" });
      await expect(operations.verify({ ...original, challengeId: randomUUID(), operationId: randomUUID() })).rejects.toMatchObject({ code: "challenge_invalidated" });
      expect(await fixture.counts()).toEqual(before);
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state,failed_attempts,verified_at from public.contact_verification_challenges where id=${issued.result.challengeId}`)).rows).toEqual([{ state: "issued", failed_attempts: 0, verified_at: null }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_operations where actor_user_id=${otherUserId} or tribe_id=${otherTribeId}`)).rows).toEqual([{ count: 0 }]);
      });
      expect(await operations.verify({ ...original, operationId: randomUUID() })).toMatchObject({ state: "completed", result: { purpose: "admission", result: "verified" } });
      expect(await fixture.counts()).toMatchObject({ challenges: 1, deliveries: 1, events: 1, operations: 2, proofs: 1, memberships: 0 });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select "emailVerified" as verified from public."user" where id=${fixture.context.userId}`)).rows).toEqual([{ verified: false }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.session where "userId"=${fixture.context.userId}`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.global_identity_evidence where user_id=${fixture.context.userId}`)).rows).toEqual([{ count: 0 }]);
      });
    });
  }, 1_200_000);
});
