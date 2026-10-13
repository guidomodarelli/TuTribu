/** @vitest-environment node */
/** Exercises physical owner deletion racing a real local proof attachment. @module admission-proof-account-deletion-race-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { withAdmissionAccountDeletionContention } from "@/tests/support/admission-account-deletion-contention";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native proof attachment after concurrent account deletion", () => {
  it("should retain one protected reservation without consuming the claimant proof or changing its pending request", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database), ownerUserId = randomUUID(), ownerRequestId = randomUUID(), bindingId = randomUUID(), requestId = randomUUID();
      await database.applyMigration("20261006200000_scope_admission_audit_operations.sql");
      await database.applyMigration("20261010100000_minimize_deleted_admission_contact_owners.sql");
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const issued = await operations.issue({ ...fixture.input, expectedPolicyVersion: 2 });
      if (issued.state !== "completed") throw new Error("Admission deletion race failed: claimant_challenge_unavailable");
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 };
      const code = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.result.challengeId);
      const verified = await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: code.code });
      if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("Admission deletion race failed: claimant_proof_unavailable");
      await database.withContext(fixture.fixture.own, async (transaction) => {
        const fingerprint = await createAdmissionContactFingerprint(fixture.input.contact, fixture.fixture.config);
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${ownerUserId},'Synthetic former contact owner',${`${ownerUserId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        // The historical owner is an independent account with a prior pending
        // presentation; the claimant obtained its own genuine local proof.
        await transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,submitted_at,expires_at) select ${ownerRequestId},${fixture.context.tribeId},${ownerUserId},'common','email',${fixture.input.contact.value},'declared',now,now+interval '30 days' from instant`);
        await transaction.execute(sql`insert into public.academy_admission_contact_bindings(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,owner_user_id,first_request_id,evidence_source) values (${bindingId},${fixture.context.tribeId},'email',${fixture.input.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},${ownerUserId},${ownerRequestId},'base')`);
        await transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,submitted_at,expires_at) select ${requestId},${fixture.context.tribeId},${fixture.context.userId},'common','none',now,now+interval '30 days' from instant`);
      });
      const original = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select submitted_at,expires_at,status,version,contact_type,normalized_contact,proof_id,binding_id from public.academy_admission_requests where id=${requestId}`)).rows[0]);
      const input = { ...fixture.context, admissionRequestId: requestId, proofId: verified.result.proofId, operationId: randomUUID(), expectedRequestVersion: 1 };
      const claimed = await withAdmissionAccountDeletionContention(database, fixture.fixture.own, ownerUserId, () => operations.apply(input));
      expect(claimed).toMatchObject({ status: "fulfilled", value: { state: "completed", replayed: false, result: { outcome: "denied", code: "contact_binding_conflict" } } });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id,normalized_contact,owner_user_id,minimized_at is not null as minimized from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ id: bindingId, normalized_contact: null, owner_user_id: null, minimized: true }]);
        expect((await transaction.execute(sql`select submitted_at,expires_at,status,version,contact_type,normalized_contact,proof_id,binding_id from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([original]);
        expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${input.proofId}`)).rows).toEqual([{ status: "available", applied_request_id: null }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_audit_events where resource_id=${requestId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public."user" where id=${ownerUserId}`)).rows).toEqual([{ count: 0 }]);
      });
      expect(await operations.apply(input)).toMatchObject({ state: "completed", replayed: true, result: { outcome: "denied", code: "contact_binding_conflict" } });
    }, { concurrentTransactions: 4 });
  }, 1_200_000);
});
