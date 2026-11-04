/** @vitest-environment node */
/** Exercises rows saved before an Argentine mobile took its 9 against the canonical mobile form, with real SQL, crypto and session. @module admission-historical-argentine-mobile-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { preparePersonalContactIssuance } from "@/tests/support/personal-contact-issuance-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";

/** Form without the 9 that earlier versions stored for the fixture's canonical mobile `+5491155501234`. */
const HISTORICAL_MOBILE = "+541155501234";
const MATCHING_MIGRATION = "20261101180000_match_historical_argentine_mobile_contacts.sql";

/** @param database - Owned disposable branch. @returns A phone (SMS) policy that requires a local proof, its native operations and a common pending without a contact. */
async function preparePhonePending(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareAdmissionContactVerification(database, false, undefined, true), pendingId = randomUUID();
  for (const migration of ["20261006200000_scope_admission_audit_operations.sql", "20261010100000_minimize_deleted_admission_contact_owners.sql", MATCHING_MIGRATION]) await database.applyMigration(migration);
  await database.withContext(fixture.fixture.own, async (transaction) => {
    await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=ARRAY['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
    await transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,phone_channel='sms',verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
  });
  const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
  /** @param storedContact - Phone the pending already holds, or `null` for none. @returns Nothing after the own pending exists. */
  const insertPending = (storedContact: string | null) => database.withContext(fixture.own, (transaction) => transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,submitted_at,expires_at) select ${pendingId},${fixture.context.tribeId},${fixture.context.userId},'common',${storedContact === null ? null : "phone"},${storedContact},${storedContact === null ? "none" : "declared"},now-interval '1 day',now+interval '29 days' from instant`));
  /** @returns The applicant's verified proof of the canonical mobile for its pending. */
  const verifyCanonicalMobile = async () => {
    const issued = await operations.issue({ ...fixture.input, expectedPolicyVersion: 2, admissionRequestId: pendingId });
    if (issued.state !== "completed") throw new Error("Historical mobile fixture expected a committed challenge");
    const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 };
    const received = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.result.challengeId);
    const verified = await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: received.code });
    if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("Historical mobile fixture expected a local proof");
    return verified.result.proofId;
  };
  return { fixture, operations, pendingId, insertPending, verifyCanonicalMobile };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("Argentine mobile rows saved without the 9", () => {
  it("should keep a minimized reservation saved without the 9 blocking the mobile form from another account", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange a former owner whose binding of the form without the 9 is minimized when its account is deleted.
      const { fixture, operations, pendingId, insertPending, verifyCanonicalMobile } = await preparePhonePending(database);
      const ownerUserId = randomUUID(), ownerRequestId = randomUUID(), bindingId = randomUUID();
      await database.withContext(fixture.fixture.own, async (transaction) => {
        const fingerprint = await createAdmissionContactFingerprint({ type: "phone", value: HISTORICAL_MOBILE, country: "AR" }, fixture.fixture.config);
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${ownerUserId},'Synthetic former phone owner',${`${ownerUserId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,submitted_at,expires_at) select ${ownerRequestId},${fixture.context.tribeId},${ownerUserId},'common','phone',${HISTORICAL_MOBILE},'declared',now,now+interval '30 days' from instant`);
        await transaction.execute(sql`insert into public.academy_admission_contact_bindings(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,owner_user_id,first_request_id,evidence_source) values (${bindingId},${fixture.context.tribeId},'phone',${HISTORICAL_MOBILE},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},${ownerUserId},${ownerRequestId},'local')`);
        await transaction.execute(sql`delete from public."user" where id=${ownerUserId}`);
      });
      await insertPending(null);
      const proofId = await verifyCanonicalMobile();

      // Act: the claimant attaches its genuine proof of the mobile form to its own pending.
      const input = { ...fixture.context, admissionRequestId: pendingId, proofId, operationId: randomUUID(), expectedRequestVersion: 1 };
      const result = await operations.apply(input);

      // Assert the reservation is the only trace of the former owner and still wins.
      expect(result).toMatchObject({ state: "completed", result: { outcome: "denied", code: "contact_binding_conflict" } });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id,normalized_contact,owner_user_id,minimized_at is not null as minimized from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ id: bindingId, normalized_contact: null, owner_user_id: null, minimized: true }]);
        expect((await transaction.execute(sql`select contact_type,normalized_contact,binding_id from public.academy_admission_requests where id=${pendingId}`)).rows).toEqual([{ contact_type: null, normalized_contact: null, binding_id: null }]);
        expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${proofId}`)).rows).toEqual([{ status: "available", applied_request_id: null }]);
      });
    });
  }, 1_200_000);

  it("should attach a mobile proof to a pending saved without the 9 and keep its stored contact", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange a pending declared before the mobile form existed.
      const { fixture, operations, pendingId, insertPending, verifyCanonicalMobile } = await preparePhonePending(database);
      await insertPending(HISTORICAL_MOBILE);
      const proofId = await verifyCanonicalMobile();

      // Act.
      const result = await operations.apply({ ...fixture.context, admissionRequestId: pendingId, proofId, operationId: randomUUID(), expectedRequestVersion: 1 });

      // Assert the proof makes it reviewable without rewriting its immutable contact, and own eligibility finds the new binding.
      expect(result).toMatchObject({ state: "completed", result: { outcome: "applied", requestId: pendingId, requestVersion: 2, proofId } });
      await database.withContext(fixture.own, async (transaction) => {
        const request = (await transaction.execute<{ normalized_contact: string; evidence_source: string; proof_id: string; binding_id: string }>(sql`select normalized_contact,evidence_source,proof_id,binding_id from public.academy_admission_requests where id=${pendingId}`)).rows[0];
        expect(request).toMatchObject({ normalized_contact: HISTORICAL_MOBILE, evidence_source: "local", proof_id: proofId, binding_id: expect.any(String) });
        expect((await transaction.execute(sql`select normalized_contact,owner_user_id from public.academy_admission_contact_bindings where id=${request.binding_id}`)).rows).toEqual([{ normalized_contact: fixture.input.contact.value, owner_user_id: fixture.context.userId }]);
        const eligibility = (await transaction.execute<{ binding: unknown }>(sql`select record->'contactBinding' as binding from public.read_own_admission_request_eligibility(${fixture.context.tribeId},${fixture.context.sessionId},${pendingId})`)).rows;
        expect(eligibility).toEqual([{ binding: { ownerUserId: fixture.context.userId, contactType: "phone", contactValue: fixture.input.contact.value } }]);
      });
    });
  }, 1_200_000);

  it("should verify, preview and redeem a personal invitation saved without the 9 with the mobile form", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange an invitation whose row still holds the form without the 9.
      const { fixture, operations, invitationId, input, token } = await preparePersonalContactIssuance(database, true, undefined, HISTORICAL_MOBILE);
      for (const migration of ["20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql", "20261011024000_read_current_own_admission_eligibility.sql", MATCHING_MIGRATION]) await database.applyMigration(migration);
      const issued = await operations.issue(input);
      if (issued.state !== "completed") throw new Error("Historical invitation fixture expected a committed challenge");
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 };
      const code = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.result.challengeId);
      const verified = await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: code.code });
      if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("Historical invitation fixture expected a local proof");
      const proofId = verified.result.proofId;
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.userId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const admissions = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) });

      // Act: preview with the proof, then redeem typing the number without its 9, as the invitation was saved.
      const preview = await admissions.createPersonalInvitationQueryModule({ readSecurityConfig: async () => fixture.fixture.config }).useCases.overview.execute({ token: token.token, requestId: randomUUID(), proofId });
      const submit = admissions.createManualRequestModule({ readSecurityConfig: async () => fixture.fixture.config }).useCases.submit;
      const result = await submit.execute({ tribeId: fixture.context.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 2, confirmed: true as const, invitationToken: token.token, proofId, phone: "+54 11 5550 1234" });

      // Assert the proof is recognized against the invitation and redemption keeps its lineage.
      expect(preview).toMatchObject({ ok: true, value: { state: "available" } });
      expect(result).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", created: true } } });
      if (!result.ok || result.value.state !== "completed" || !result.value.result.admissionRequestId) throw new Error("Expected a personal pending from the historical invitation");
      const requestId = result.value.result.admissionRequestId;
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select source,status,invitation_id,evidence_source,proof_id,normalized_contact from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ source: "personal", status: "pending", invitation_id: invitationId, evidence_source: "local", proof_id: proofId, normalized_contact: fixture.input.contact.value }]);
        expect((await transaction.execute(sql`select status,redeemed_request_id,normalized_contact from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", redeemed_request_id: requestId, normalized_contact: HISTORICAL_MOBILE }]);
      });
    });
  }, 1_200_000);
});
