/** @vitest-environment node */

/** Exercises local code consumption and global failure limits with real SQL and Web Crypto. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { PostgresContactVerificationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-contact-verification-repository";
import { PostgresVerificationFailureBudget } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-failure-budget";

import { prepareContactVerificationDatabase, seedContactVerificationChallenge, createContactVerificationWriter } from "@/tests/support/contact-verification-database-fixture";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("contact verification writer", () => {
  it("should reject a code that expires during the final capacity lookup without consuming it or issuing a proof",async()=>{
    await withAcademyAdmissionDatabase(async(database)=>{
      const fixture=await prepareContactVerificationDatabase(database);
      const instant=await database.withContext(fixture.own,async(transaction)=>(await transaction.execute<{now:Date|string}>(sql`select clock_timestamp() as now`)).rows[0].now);
      const challenge=await seedContactVerificationChallenge(database,fixture,"admission",new Date(new Date(instant).getTime()-570_000));
      let capacityReads=0;
      const outcome=await database.withContext(fixture.own,async(transaction)=>{
        const budget=new PostgresVerificationFailureBudget(transaction);
        const writer=new PostgresContactVerificationRepository(transaction,async(database,scope)=>Boolean((await database.execute(sql`select id from public.tribes where id=${scope.tribeId} for share`)).rows[0]),async()=>fixture.config,{
          lockAccount:(userId)=>budget.lockAccount(userId),readRecordedFailure:(identity)=>budget.readRecordedFailure(identity),recordFailure:(identity,now)=>budget.recordFailure(identity,now),
          hasCapacity:async(userId,now)=>{
            capacityReads+=1;
            if(capacityReads===2)await transaction.execute(sql`select pg_sleep(greatest(0,extract(epoch from (expires_at-clock_timestamp())))+0.1) from public.contact_verification_challenges where id=${challenge.challengeId}`);
            return budget.hasCapacity(userId,now);
          },
        });
        return writer.validate({scope:challenge.scope,challengeId:challenge.challengeId,operationId:randomUUID(),code:challenge.code});
      });
      expect(capacityReads).toBe(2);expect(outcome).toMatchObject({outcome:"denied",reason:"verification_challenge_expired"});
      await database.withContext(fixture.own,async(transaction)=>{
        expect((await transaction.execute(sql`select state,failed_attempts,code_mac is not null as mac_retained from public.contact_verification_challenges where id=${challenge.challengeId}`)).rows).toEqual([{state:"issued",failed_attempts:0,mac_retained:true}]);
        expect((await transaction.execute(sql`select id from public.academy_admission_verification_proofs where challenge_id=${challenge.challengeId}`)).rows).toEqual([]);
      });
    });
  },180_000);

  it("should consume a current code once, issue one fresh proof and destroy its envelope without a ready provider or send quota", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const challenge = await seedContactVerificationChallenge(database, fixture);
      const validate = () => database.withContext(fixture.own, (transaction) => createContactVerificationWriter(transaction, fixture).validate({ scope: challenge.scope, challengeId: challenge.challengeId, operationId: randomUUID(), code: challenge.code }));
      const outcomes = await Promise.all([validate(), validate()]);
      expect(outcomes.filter((outcome) => outcome.outcome === "verified")).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.outcome === "denied")).toHaveLength(1);
      await database.withContext(fixture.own, async (transaction) => {
        const persisted = (await transaction.execute(sql`select state,version,code_mac,code_envelope_id,failed_attempts from public.contact_verification_challenges where id=${challenge.challengeId}`)).rows[0];
        expect(persisted).toEqual({ state: "verified", version: 2, code_mac: null, code_envelope_id: null, failed_attempts: 0 });
        expect((await transaction.execute(sql`select id from public.verification_code_envelopes where id=${challenge.envelopeId}`)).rows).toEqual([]);
        const proofs = (await transaction.execute<{ status: string; lifetime_ms: number }>(sql`select status,extract(epoch from (apply_before-verified_at))*1000 as lifetime_ms from public.academy_admission_verification_proofs where challenge_id=${challenge.challengeId}`)).rows;
        expect(proofs).toHaveLength(1);
        expect(proofs[0].status).toBe("available");
        expect(Number(proofs[0].lifetime_ms)).toBe(900_000);
        expect((await transaction.execute(sql`select id from public.messaging_usage_events where actor_user_id=${fixture.userId}`)).rows).toEqual([]);
      });
    });
  }, 180_000);

  it("should preserve five-failure destruction, replay and the hourly account budget across tribes", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const first = await seedContactVerificationChallenge(database, fixture), second = await seedContactVerificationChallenge(database, fixture), third = await seedContactVerificationChallenge(database, fixture);
      const fail = (challenge: typeof first, operationId = randomUUID()) => database.withContext(fixture.own, (transaction) => createContactVerificationWriter(transaction, fixture).validate({ scope: challenge.scope, challengeId: challenge.challengeId, operationId, code: "000000" }));
      const replayId = randomUUID();
      expect(await fail(first, replayId)).toMatchObject({ outcome: "wrong_code" });
      expect(await fail(first, replayId)).toMatchObject({ outcome: "wrong_code" });
      for (let attempt = 0; attempt < 4; attempt += 1) expect(await fail(first)).toMatchObject({ outcome: "wrong_code" });
      expect(await fail(first)).toMatchObject({ outcome: "denied", reason: "verification_challenge_unavailable" });
      for (let attempt = 0; attempt < 5; attempt += 1) expect(await fail(second)).toMatchObject({ outcome: "wrong_code" });
      expect(await database.withContext(fixture.own, (transaction) => createContactVerificationWriter(transaction, fixture).validate({ scope: third.scope, challengeId: third.challengeId, operationId: randomUUID(), code: third.code }))).toEqual({ outcome: "denied", reason: "verification_account_rate_limited" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select failed_attempts,state,code_mac,code_envelope_id from public.contact_verification_challenges where id=${first.challengeId}`)).rows).toEqual([{ failed_attempts: 5, state: "invalidated", code_mac: null, code_envelope_id: null }]);
        expect((await transaction.execute(sql`select id from public.verification_code_envelopes where id=${first.envelopeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select count(*)::integer as failures from public.messaging_usage_events where actor_user_id=${fixture.userId} and event_type='code_failure'`)).rows).toEqual([{ failures: 10 }]);
        expect((await transaction.execute(sql`select state,failed_attempts from public.contact_verification_challenges where id=${third.challengeId}`)).rows).toEqual([{ state: "issued", failed_attempts: 0 }]);
      });
    });
  }, 180_000);

  it("should reject crossed scope, lost authorization and a newly closed security epoch without consuming the code", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const challenge = await seedContactVerificationChallenge(database, fixture);
      const command = { scope: challenge.scope, challengeId: challenge.challengeId, operationId: randomUUID(), code: challenge.code };
      expect(await database.withContext(fixture.own, (transaction) => createContactVerificationWriter(transaction, fixture).validate({ ...command, scope: { ...command.scope, userId: randomUUID() } }))).toMatchObject({ outcome: "denied", reason: "verification_scope_mismatch" });
      let authorizations = 0;
      expect(await database.withContext(fixture.own, (transaction) => createContactVerificationWriter(transaction, fixture, async () => ++authorizations === 1).validate(command))).toMatchObject({ outcome: "denied", reason: "verification_scope_mismatch" });
      expect(await database.withContext(fixture.own, (transaction) => new PostgresContactVerificationRepository(transaction, async () => true, async () => ({ ...fixture.config, environment: "crossed-environment" }), new PostgresVerificationFailureBudget(transaction)).validate(command))).toMatchObject({ outcome: "denied", reason: "verification_challenge_unavailable" });
      let securityReads = 0;
      expect(await database.withContext(fixture.own, (transaction) => new PostgresContactVerificationRepository(transaction, async () => true, async () => ({ ...fixture.config, recoveryLocked: ++securityReads > 1 }), new PostgresVerificationFailureBudget(transaction)).validate(command))).toMatchObject({ outcome: "denied", reason: "verification_challenge_unavailable" });
      await expect(database.withContext(fixture.own, async (transaction) => {
        expect(await createContactVerificationWriter(transaction, fixture).validate({ ...command, code: "000000" })).toMatchObject({ outcome: "wrong_code" });
        throw new Error("Controlled owner transaction rollback");
      })).rejects.toThrow("Controlled owner transaction rollback");
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state,version,failed_attempts,code_mac is not null as has_mac,code_envelope_id from public.contact_verification_challenges where id=${challenge.challengeId}`)).rows).toEqual([{ state: "issued", version: 1, failed_attempts: 0, has_mac: true, code_envelope_id: challenge.envelopeId }]);
        expect((await transaction.execute(sql`select id from public.messaging_usage_events where actor_user_id=${fixture.userId}`)).rows).toEqual([]);
      });
    });
  }, 180_000);

  it("should enforce the UTC daily limit and moving hour independently of the database session timezone", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const challenge = await seedContactVerificationChallenge(database, fixture);
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`set local time zone 'Pacific/Honolulu'`);
        const budget = new PostgresVerificationFailureBudget(transaction);
        await budget.lockAccount(fixture.userId);
        const identity = { ...challenge.scope, challengeId: challenge.challengeId, operationId: randomUUID() };
        for (let failure = 0; failure < 20; failure += 1) await budget.recordFailure({ ...identity, operationId: randomUUID() }, new Date("2026-10-06T00:00:00.000Z"));
        expect(await budget.hasCapacity(fixture.userId, new Date("2026-10-06T12:00:00.000Z"))).toBe(false);
        expect(await budget.hasCapacity(fixture.userId, new Date("2026-10-07T00:00:00.000Z"))).toBe(true);
        await transaction.execute(sql`delete from public.messaging_usage_events where actor_user_id=${fixture.userId}`);
        for (let failure = 0; failure < 10; failure += 1) await budget.recordFailure({ ...identity, operationId: randomUUID() }, new Date("2026-10-06T23:00:00.000Z"));
        expect(await budget.hasCapacity(fixture.userId, new Date("2026-10-06T23:59:59.999Z"))).toBe(false);
        expect(await budget.hasCapacity(fixture.userId, new Date("2026-10-07T00:00:00.000Z"))).toBe(true);
      });
    });
  }, 180_000);

  it("should consume a diagnostic code locally without issuing any admission proof", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const challenge = await seedContactVerificationChallenge(database, fixture, "connection_diagnostic");
      expect(await database.withContext(fixture.own, (transaction) => createContactVerificationWriter(transaction, fixture).validate({ scope: challenge.scope, challengeId: challenge.challengeId, operationId: randomUUID(), code: challenge.code }))).toMatchObject({ outcome: "verified", purpose: "connection_diagnostic", proofId: null });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id from public.academy_admission_verification_proofs where challenge_id=${challenge.challengeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.verification_code_envelopes where challenge_id=${challenge.challengeId}`)).rows).toEqual([]);
      });
    });
  }, 180_000);
});
