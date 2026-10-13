/** @vitest-environment node */
/** Exercises a coherent historical personal request expiring through the actual owner without recycling its consumed token. @module personal-invitation-expired-request-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { createPersonalInvitationTokenCodec } from "@/src/modules/academy-admissions/infrastructure/tokens/personal-invitation-token";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native consumed invitation after request expiry", () => {
  it("should expire the historical request during a separate common presentation and never recycle its original redeemed link", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange a historical thirty-day request whose original evidence existed
      // before presentation. Its old capture is retired; current auth is real.
      const { fixture, applicant: createApplicant, leader } = await prepareAllowlistAdmission(database);
      const recipient = await createApplicant();
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set mode='manual_review',version=version+1 where tribe_id=${fixture.tribeId}`));
      const invitationId = randomUUID(), requestId = randomUUID(), bindingId = randomUUID(), oldEvidenceId = randomUUID();
      const contact = { type: "email" as const, value: recipient.email };
      const fingerprint = await createAdmissionContactFingerprint(contact, fixture.config);
      const token = await createPersonalInvitationTokenCodec(fixture.config).issue({ tribeId: fixture.tribeId, invitationId });
      await database.withContext(fixture.own, async (transaction) => {
        // One transaction timestamp keeps the exact thirty-day fixture invariant.
        await transaction.execute(sql`select set_config('admission_test.historical_now',clock_timestamp()::text,true)`);
        await transaction.execute(sql`insert into public.global_identity_evidence(id,user_id,account_id,provider_id,provider_subject,normalized_email,email_verified_claim,hosted_domain,classification,issuer,audience,token_issued_at,token_expires_at,verified_at,invalidated_at,invalidation_reason) values (${oldEvidenceId},${recipient.userId},${recipient.accountId},'google',${recipient.subject},${recipient.email},true,'example.test','workspace','https://accounts.google.com','synthetic-list-client',current_setting('admission_test.historical_now')::timestamptz-interval '32 days',current_setting('admission_test.historical_now')::timestamptz-interval '32 days'+interval '1 hour',current_setting('admission_test.historical_now')::timestamptz-interval '32 days',current_setting('admission_test.historical_now')::timestamptz-interval '2 days','superseded_capture')`);
        await transaction.execute(sql`insert into public.academy_personal_invitations(id,tribe_id,created_by_user_id,internal_name,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,requires_allowlist,expires_at,token_hash,token_key_id,token_context_digest,created_at,updated_at) values (${invitationId},${fixture.tribeId},${fixture.userId},'Canje histórico coherente','email',${recipient.email},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},false,current_setting('admission_test.historical_now')::timestamptz-interval '25 days',${Buffer.from(token.lookupDigest)},${token.keyId},${Buffer.from(token.digest)},current_setting('admission_test.historical_now')::timestamptz-interval '32 days',current_setting('admission_test.historical_now')::timestamptz-interval '32 days')`);
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,invitation_id,requires_allowlist,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,evidence_source,global_identity_evidence_id,binding_id,original_policy_snapshot,submitted_at,expires_at,version) values (${requestId},${fixture.tribeId},${recipient.userId},'personal',${invitationId},false,'email',${recipient.email},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},'base',${oldEvidenceId},${bindingId},'{"version":3,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":true}'::jsonb,current_setting('admission_test.historical_now')::timestamptz-interval '31 days',current_setting('admission_test.historical_now')::timestamptz-interval '1 day',2)`);
        await transaction.execute(sql`insert into public.academy_admission_contact_bindings(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,owner_user_id,first_request_id,evidence_source,created_at) values (${bindingId},${fixture.tribeId},'email',${recipient.email},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},${recipient.userId},${requestId},'base',current_setting('admission_test.historical_now')::timestamptz-interval '31 days')`);
        await transaction.execute(sql`update public.academy_personal_invitations set status='redeemed',version=2,redeemed_by_user_id=${recipient.userId},redeemed_request_id=${requestId},redeemed_at=current_setting('admission_test.historical_now')::timestamptz-interval '31 days',updated_at=current_setting('admission_test.historical_now')::timestamptz-interval '31 days' where id=${invitationId}`);
      });

      // Act: a common confirmation is a different, explicit choice. It expires
      // the old request through the real writer and never attaches its token.
      const commonInput = { ...recipient.input, operationId: randomUUID(), expectedPolicyVersion: 3 };
      const common = await recipient.commands.submit.execute(commonInput);
      expect(common).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "pending", created: true } } });
      if (!common.ok || common.value.state !== "completed" || !common.value.result.admissionRequestId) throw new Error("Expired personal request flow failed: separate_common_pending_unavailable");
      const commonRequestId = common.value.result.admissionRequestId;
      expect(commonRequestId).not.toBe(requestId);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,invitation_id from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "expired", version: 3, invitation_id: invitationId }]);
        expect((await transaction.execute(sql`select source,invitation_id from public.academy_admission_requests where id=${commonRequestId}`)).rows).toEqual([{ source: "common", invitation_id: null }]);
        expect((await transaction.execute(sql`select event_type from public.academy_admission_notification_obligations where request_id=${requestId}`)).rows).toEqual([{ event_type: "expired" }]);
      });
      const cancellation = { tribeId: fixture.tribeId, requestId: randomUUID(), operationId: randomUUID(), admissionRequestId: commonRequestId, expectedVersion: common.value.result.committedRequestVersion!, confirmed: true as const, internalReason: "Cerrar la presentación común independiente" };
      const cancelled = await recipient.commands.cancelOwn.execute(cancellation);
      if (!cancelled.ok || cancelled.value.state !== "completed") throw new Error("Expired personal request flow failed: common_cancellation_unavailable");
      await fixture.confirm(REAUTHENTICATION_OPERATION.advanceAdmissionRetry, commonRequestId);
      expect(await leader.allowRetry.execute({ ...cancellation, operationId: randomUUID(), expectedVersion: cancelled.value.result.version, internalReason: "Otro intento permitido sin reciclar fuentes" })).toMatchObject({ ok: true, value: { state: "completed" } });
      expect(await recipient.commands.submit.execute({ ...recipient.input, operationId: randomUUID(), expectedPolicyVersion: 3, invitationToken: token.token })).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });

      // Assert the original source, account binding and expired request survive.
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", version: 2, redeemed_request_id: requestId }]);
        expect((await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "expired", version: 3 }]);
        expect((await transaction.execute(sql`select owner_user_id,first_request_id from public.academy_admission_contact_bindings where id=${bindingId}`)).rows).toEqual([{ owner_user_id: recipient.userId, first_request_id: requestId }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_requests where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 2 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ count: 0 }]);
      });
    });
  }, 1_200_000);
});
