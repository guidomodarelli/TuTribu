/** @vitest-environment node */
/** Exercises atomic native attachment, proof scope, original replay and fixed pending dates over PostgreSQL. @module admission-proof-operation-persistence-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission proof attachment operation", () => {
  it("should attach the first contact once, preserve the original pending deadline and recover a lost commit without another binding or audit", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database);
      await database.applyMigration("20261006200000_scope_admission_audit_operations.sql");
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      let loseCommit = false;
      const operations = new PostgresAdmissionContactVerificationOperations(async (_scope, run) => { const value = await database.withContext(fixture.own, run); if (loseCommit && typeof value === "object" && value !== null && "state" in value && value.state === "completed") { loseCommit = false; throw new Error("Synthetic proof attachment COMMIT response lost"); } return value; }, async () => fixture.fixture.config);
      const issued = await operations.issue({ ...fixture.input, expectedPolicyVersion: 2 });
      if (issued.state !== "completed") throw new Error("Expected original applicant challenge");
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 };
      const recovered = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.result.challengeId);
      const verified = await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: recovered.code });
      if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("Expected original local admission proof");
      const requestId = randomUUID();
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,submitted_at,expires_at) select ${requestId},${fixture.context.tribeId},${fixture.context.userId},'common','none',now-interval '1 day',now+interval '29 days' from instant`));
      const original = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select submitted_at,expires_at,status,version,contact_type,normalized_contact from public.academy_admission_requests where id=${requestId}`)).rows[0]);
      const input = { ...fixture.context, admissionRequestId: requestId, proofId: verified.result.proofId, operationId: randomUUID(), expectedRequestVersion: 1 };
      loseCommit = true;
      const applied = await operations.apply(input);
      expect(applied).toMatchObject({ state: "completed", result: { outcome: "applied", requestId, requestVersion: 2, status: "pending", proofId: input.proofId } });
      expect(await operations.apply(input)).toMatchObject({ state: "completed", replayed: true, result: { outcome: "applied", requestVersion: 2 } });
      const current = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select submitted_at,expires_at,status,version,contact_type,normalized_contact from public.academy_admission_requests where id=${requestId}`)).rows[0]);
      expect({ ...current, normalized_contact: undefined }).toEqual({ ...original, version: 2, contact_type: "email", normalized_contact: undefined });
      expect(current.normalized_contact === fixture.input.contact.value).toBe(true);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${input.proofId}`)).rows).toEqual([{ status: "applied", applied_request_id: requestId }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId} and owner_user_id=${fixture.context.userId}`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_audit_events where resource_id=${requestId} and event_type='proof_attached'`)).rows).toEqual([{ count: 1 }]);
      });
      expect(await operations.apply({ ...input, operationId: randomUUID(), expectedRequestVersion: 1 })).toMatchObject({ state: "completed", result: { outcome: "denied", code: "request_conflict" } });
      await expect(operations.apply({ ...input, userId: fixture.fixture.userId, sessionId: randomUUID(), operationId: randomUUID() })).rejects.toMatchObject({ code: "permission_denied" });
      expect(await fixture.counts()).toMatchObject({ proofs: 1, memberships: 0, deliveries: 1, challenges: 1 });
    });
  }, 600_000);
});
