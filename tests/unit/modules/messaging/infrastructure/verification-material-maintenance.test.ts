/** @vitest-environment node */
/** Exercises private bounded OTP destruction while preserving local code validity and charged ambiguity. @module verification-material-maintenance-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationIssuer, recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { prepareContactVerificationDatabase, seedContactVerificationChallenge, createContactVerificationWriter } from "@/tests/support/contact-verification-database-fixture";
import { PostgresMessageDeliveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-repository";
import { PostgresVerificationMaterialMaintenance } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-material-maintenance";

/** Seeds an issued real OTP and commits an actual marker separately from receipt/material maintenance. */
async function prepareMarkedDelivery(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareContactVerificationIssuer(database);
  for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql"]) await database.applyMigration(migration);
  const issued = await fixture.issue();
  if (issued.state !== "completed" || issued.result.outcome !== "issued") throw new Error("Synthetic maintenance issue did not complete");
  const original = issued.result;
  const { code } = await recoverTestVerificationCode(database, fixture, original.challengeId);
  const repository = new PostgresMessageDeliveryRepository((actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run), async () => true, async () => fixture.config);
  const claim = (await repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 90 }))[0];
  const marker = await repository.authorize(claim, randomUUID());
  if (marker.outcome !== "authorized") throw new Error("Synthetic maintenance marker did not complete");
  const maintenance = new PostgresVerificationMaterialMaintenance((run) => database.withContext({ userId: null, email: null }, run), async () => true);
  return { ...fixture, original, code, repository, context: marker.context, maintenance };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("verification material maintenance", () => {
  it("should destroy a confirmed delivery envelope once without consuming its still-valid code or changing charged history", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMarkedDelivery(database);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select * from public.complete_messaging_delivery_attempt(${fixture.context.attemptId},${fixture.context.leaseToken},1,'accepted',${randomUUID()},null,'provider_accepted')`));
      expect(await fixture.maintenance.purge({ limit: 2, deliveryId: fixture.original.deliveryId })).toBe(1);
      expect(await fixture.maintenance.purge({ limit: 2, deliveryId: fixture.original.deliveryId })).toBe(0);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id from public.verification_code_envelopes where challenge_id=${fixture.original.challengeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select state,version,code_envelope_id,code_mac is not null as has_mac from public.contact_verification_challenges where id=${fixture.original.challengeId}`)).rows).toEqual([{ state: "issued", version: 2, code_envelope_id: null, has_mac: true }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where attempt_id=${fixture.context.attemptId}`)).rows).toEqual([{ state: "consumed" }]);
        expect(await createContactVerificationWriter(transaction, fixture).validate({ scope: fixture.scope, challengeId: fixture.original.challengeId, operationId: randomUUID(), code: fixture.code })).toMatchObject({ outcome: "verified" });
      });
    });
  }, 240_000);

  it("should retain original material for a current unknown attempt and erase expired bytes in bounded concurrent batches", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareMarkedDelivery(database);
      await fixture.repository.complete({ context: fixture.context, outcome: "unknown", providerMessageId: null, correlationId: null, reason: "dispatch_result_unknown" });
      expect(await fixture.maintenance.purge({ limit: 2, deliveryId: fixture.original.deliveryId })).toBe(0);
      const older = await seedContactVerificationChallenge(database, fixture, "admission", new Date(Date.now()-660_000));
      const oldest = await seedContactVerificationChallenge(database, fixture, "admission", new Date(Date.now()-720_000));
      const counts = await Promise.all([fixture.maintenance.purge({ limit: 1 }), fixture.maintenance.purge({ limit: 1 })]);
      expect(counts.reduce((total, count) => total+count, 0)).toBe(2);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select challenge_id from public.verification_code_envelopes order by challenge_id`)).rows).toEqual([{ challenge_id: fixture.original.challengeId }]);
        expect((await transaction.execute(sql`select id,code_envelope_id from public.contact_verification_challenges where id in (${older.challengeId},${oldest.challengeId}) order by id`)).rows).toEqual([older.challengeId,oldest.challengeId].sort().map((id) => ({ id, code_envelope_id: null })));
        expect((await transaction.execute(sql`select state from public.message_delivery_attempts where id=${fixture.context.attemptId}`)).rows).toEqual([{ state: "unknown" }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where attempt_id=${fixture.context.attemptId}`)).rows).toEqual([{ state: "consumed" }]);
      });
    });
  }, 240_000);

  it("should require current maintenance authority, deny ordinary SQL access and roll back a revoked purge", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationDatabase(database);
      const challenge = await seedContactVerificationChallenge(database, fixture, "admission", new Date(Date.now()-660_000));
      await database.applyMigration("20261006160000_purge_verification_delivery_material.sql");
      let authorizations = 0;
      const revoked = new PostgresVerificationMaterialMaintenance((run) => database.withContext({ userId: null, email: null }, run), async () => { authorizations += 1; return authorizations === 1; });
      await expect(revoked.purge({ limit: 1 })).rejects.toMatchObject({ code: "permission_denied" });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id from public.verification_code_envelopes where id=${challenge.envelopeId}`)).rows)).toEqual([{ id: challenge.envelopeId }]);
      await expect(database.withContext(fixture.own, async (transaction) => transaction.execute(sql`select public.purge_messaging_verification_envelopes(1,null)`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
    });
  }, 180_000);
});
