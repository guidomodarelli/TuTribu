/** @vitest-environment node */
/** Exercises trusted base contact binding during physical historical-owner deletion. @module admission-base-account-deletion-race-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { withAdmissionAccountDeletionContention } from "@/tests/support/admission-account-deletion-contention";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { bindBaseAdmissionContact } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-base-admission-binding";
import { readAllowlistAdmissionFacts } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-allowlist-admission-facts";
import { readAdmissionPolicy } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-storage";
import { createPendingAdmissionRequest } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import type { AutomaticAdmissionFacts } from "@/src/modules/academy-admissions/domain/entities/automatic-admission-decision";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native base binding after concurrent account deletion", () => {
  it("should reject a new trusted base claim after its row lock observes the original owner disappear", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant: createApplicant } = await prepareAllowlistAdmission(database), claimant = await createApplicant(), ownerUserId = randomUUID(), ownerRequestId = randomUUID(), bindingId = randomUUID();
      await database.applyMigration("20261010100000_minimize_deleted_admission_contact_owners.sql");
      const contact = { type: "email" as const, value: claimant.email }, scope = { userId: claimant.userId, sessionId: claimant.sessionId, tribeId: fixture.tribeId, requestId: randomUUID() };
      const request = await database.withContext({ userId: claimant.userId, email: claimant.email }, async (transaction) => {
        const policy = await readAdmissionPolicy(transaction, fixture.tribeId, false), now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        if (!policy) throw new Error("Admission base deletion race failed: policy_unavailable");
        return createPendingAdmissionRequest({ id: randomUUID(), tribeId: fixture.tribeId, userId: claimant.userId, source: "common", contact, evidence: { kind: "declared" }, policy, message: null, now });
      });
      await database.withContext(fixture.own, async (transaction) => {
        const fingerprint = await createAdmissionContactFingerprint(contact, fixture.config);
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${ownerUserId},'Synthetic historical base owner',${`${ownerUserId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,submitted_at,expires_at) select ${ownerRequestId},${fixture.tribeId},${ownerUserId},'common','email',${contact.value},'declared',now,now+interval '30 days' from instant`);
        await transaction.execute(sql`insert into public.academy_admission_contact_bindings(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,owner_user_id,first_request_id,evidence_source) values (${bindingId},${fixture.tribeId},'email',${contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},${ownerUserId},${ownerRequestId},'base')`);
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,submitted_at,expires_at) values (${request.id},${request.tribeId},${request.userId},'common','email',${contact.value},'declared',${JSON.stringify(request.originalPolicy)}::jsonb,${request.submittedAt},${request.expiresAt})`);
      });
      const claim = () => database.withContext({ userId: claimant.userId, email: claimant.email }, async (transaction) => {
        const current = await readAllowlistAdmissionFacts(transaction, scope, contact), policy = await readAdmissionPolicy(transaction, fixture.tribeId, false);
        const facts: AutomaticAdmissionFacts = { ...current, now: new Date(), tribe: { id: fixture.tribeId, isAcademy: true, controlActivated: true, evaluatorEnabled: true, recoveryLocked: false }, policy, source: { kind: "common" }, contact, membership: null, localProof: null, currentConnection: null };
        await bindBaseAdmissionContact(transaction, scope, request, facts, fixture.config);
      });
      expect(await withAdmissionAccountDeletionContention(database, fixture.own, ownerUserId, claim)).toMatchObject({ status: "rejected", reason: { code: "contact_binding_conflict" } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id,normalized_contact,owner_user_id,minimized_at is not null as minimized from public.academy_admission_contact_bindings where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ id: bindingId, normalized_contact: null, owner_user_id: null, minimized: true }]);
        expect((await transaction.execute(sql`select version,evidence_source,binding_id,global_identity_evidence_id from public.academy_admission_requests where id=${request.id}`)).rows).toEqual([{ version: 1, evidence_source: "declared", binding_id: null, global_identity_evidence_id: null }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${claimant.userId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public."user" where id=${ownerUserId}`)).rows).toEqual([{ count: 0 }]);
      });
    }, { concurrentTransactions: 4 });
  }, 1_200_000);
});
