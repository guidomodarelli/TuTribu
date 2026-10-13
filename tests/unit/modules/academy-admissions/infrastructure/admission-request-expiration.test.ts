/** @vitest-environment node */
/** Exercises autonomous expiration with PostgreSQL time, real authority and atomic event effects. @module admission-request-expiration-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareAllowlistAdmission } from "@/tests/support/allowlist-admission-database-fixture";
import { buildAdmissionExpirationModule } from "@/src/modules/academy-admissions/setup";
import { createPersonalInvitationTokenCodec } from "@/src/modules/academy-admissions/infrastructure/tokens/personal-invitation-token";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";

/** @param database - Owned disposable branch. @param authorize - Current private backend gate. @returns Real expiration composition. */
function expirationModule(database: AcademyAdmissionTestDatabase, authorize: () => Promise<boolean> = async () => true) {
  return buildAdmissionExpirationModule({ execute: (run) => database.withContext({ userId: null, email: null }, run), authorize });
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native autonomous admission expiration", () => {
  it("should skip a held tribe before limiting work and expire another available tribe", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const first = await prepareAllowlistAdmission(database);
      const otherTribeId = randomUUID();
      await database.withContext(first.fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${otherTribeId},'Synthetic other expiration academy',${`expiration-${otherTribeId}`},${first.fixture.userId})`);
        await transaction.execute(sql`insert into public.academy_admission_policies(tribe_id,changed_by_user_id) values (${otherTribeId},${first.fixture.userId})`);
      });
      const second = { fixture: { ...first.fixture, tribeId: otherTribeId }, applicant: first.applicant };
      await database.applyMigration("20261011021000_expire_academy_admission_requests.sql");
      const ordered = [first, second].sort((left, right) => left.fixture.tribeId.localeCompare(right.fixture.tribeId));
      const [held, available] = ordered;
      const requests: string[] = [];
      for (const academy of ordered) {
        const owner = await academy.applicant();
        const requestId = randomUUID();
        requests.push(requestId);
        await database.withContext(academy.fixture.own, (transaction) => transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,original_policy_snapshot,submitted_at,expires_at) values (${requestId},${academy.fixture.tribeId},${owner.userId},'common','none','{"version":2,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":true}'::jsonb,transaction_timestamp()-interval '31 days',transaction_timestamp()-interval '1 day')`));
      }
      let confirmHeld!: () => void;
      let releaseHeld!: () => void;
      const heldReady = new Promise<void>((resolve) => { confirmHeld = resolve; });
      const release = new Promise<void>((resolve) => { releaseHeld = resolve; });
      const holder = database.withContext(held.fixture.own, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${held.fixture.tribeId} for update`);
        confirmHeld();
        await release;
      });
      try {
        await Promise.race([heldReady, holder]);
        expect(await expirationModule(database).useCases.expireRequests.execute({ limit: 1 })).toEqual({ expired: 1 });
        expect((await database.withContext(available.fixture.own, (transaction) => transaction.execute(sql`select status from public.academy_admission_requests where id=${requests[1]}`))).rows).toEqual([{ status: "expired" }]);
        expect((await database.withContext(held.fixture.own, (transaction) => transaction.execute(sql`select status from public.academy_admission_requests where id=${requests[0]}`))).rows).toEqual([{ status: "pending" }]);
      } finally {
        releaseHeld();
        await holder;
      }
      expect(await expirationModule(database).useCases.expireRequests.execute({ limit: 1 })).toEqual({ expired: 1 });
      expect(await expirationModule(database).useCases.expireRequests.execute({ limit: 1 })).toEqual({ expired: 0 });
    });
  }, 360_000);

  it("should expire bounded paused requests once across concurrent batches and retain unexpired requests", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant } = await prepareAllowlistAdmission(database);
      await database.applyMigration("20261011021000_expire_academy_admission_requests.sql");
      const dueRequestIds: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const owner = await applicant();
        const requestId = randomUUID();
        dueRequestIds.push(requestId);
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`
          insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,original_policy_snapshot,submitted_at,expires_at)
          values (${requestId},${fixture.tribeId},${owner.userId},'common','none',
            '{"version":2,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":true}'::jsonb,
            transaction_timestamp()-interval '31 days',transaction_timestamp()-interval '1 day')
        `));
      }
      const currentOwner = await applicant();
      const liveRequestId = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_admission_policies set is_open=false,version=version+1 where tribe_id=${fixture.tribeId}`);
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,original_policy_snapshot,submitted_at,expires_at) values (${liveRequestId},${fixture.tribeId},${currentOwner.userId},'common','none','{"version":2,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":true}'::jsonb,transaction_timestamp(),transaction_timestamp()+interval '30 days')`);
      });
      const before = await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select id,submitted_at,expires_at from public.academy_admission_requests where tribe_id=${fixture.tribeId} order by id`));
      let authorizationCalls = 0;
      const revoked = expirationModule(database, async () => { authorizationCalls += 1; return authorizationCalls === 1; });
      await expect(revoked.useCases.expireRequests.execute({ limit: 1 })).rejects.toMatchObject({ code: "permission_denied" });
      expect((await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select count(*)::int as count from public.academy_admission_decisions where tribe_id=${fixture.tribeId}`))).rows).toEqual([{ count: 0 }]);
      const expiration = expirationModule(database);
      expect(await expiration.useCases.expireRequests.execute({ limit: 1 })).toEqual({ expired: 1 });
      const concurrent = await Promise.all([expiration.useCases.expireRequests.execute({ limit: 100 }), expiration.useCases.expireRequests.execute({ limit: 100 })]);
      expect(concurrent.reduce((total, result) => total + result.expired, 0)).toBe(2);
      expect(await expiration.useCases.expireRequests.execute()).toEqual({ expired: 0 });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id,submitted_at,expires_at from public.academy_admission_requests where tribe_id=${fixture.tribeId} order by id`)).rows).toEqual(before.rows);
        expect((await transaction.execute(sql`select id,status,version from public.academy_admission_requests where tribe_id=${fixture.tribeId} order by id`)).rows).toEqual([...dueRequestIds.map((requestId) => ({ id: requestId, status: "expired", version: 2 })), { id: liveRequestId, status: "pending", version: 1 }].sort((left, right) => left.id.localeCompare(right.id)));
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_decisions where tribe_id=${fixture.tribeId} and outcome='expired' and actor_kind='system' and actor_user_id is null`)).rows).toEqual([{ count: 3 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_audit_events where tribe_id=${fixture.tribeId} and event_type='expired'`)).rows).toEqual([{ count: 3 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_notification_obligations where tribe_id=${fixture.tribeId} and event_type='expired'`)).rows).toEqual([{ count: 3 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.notifications where tribe_id=${fixture.tribeId} and type='admission_expired'`)).rows).toEqual([{ count: 3 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ count: 0 }]);
      });
      await expect(database.withContext({ userId: null, email: null }, (transaction) => transaction.execute(sql`select public.expire_academy_admission_requests(1)`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
    });
  }, 360_000);

  it("should recover a lost expiration commit response without recycling a consumed personal invitation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const { fixture, applicant } = await prepareAllowlistAdmission(database);
      const recipient = await applicant();
      await database.applyMigration("20261009130000_add_personal_invitation_context_digest.sql");
      await database.applyMigration("20261011021000_expire_academy_admission_requests.sql");
      const invitationId = randomUUID(), requestId = randomUUID(), bindingId = randomUUID(), evidenceId = randomUUID();
      const contact = { type: "email" as const, value: recipient.email };
      const fingerprint = await createAdmissionContactFingerprint(contact, fixture.config);
      const token = await createPersonalInvitationTokenCodec(fixture.config).issue({ tribeId: fixture.tribeId, invitationId });
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`select set_config('admission_test.historical_now',clock_timestamp()::text,true)`);
        await transaction.execute(sql`insert into public.global_identity_evidence(id,user_id,account_id,provider_id,provider_subject,normalized_email,email_verified_claim,hosted_domain,classification,issuer,audience,token_issued_at,token_expires_at,verified_at,invalidated_at,invalidation_reason) values (${evidenceId},${recipient.userId},${recipient.accountId},'google',${recipient.subject},${recipient.email},true,'example.test','workspace','https://accounts.google.com','synthetic-list-client',current_setting('admission_test.historical_now')::timestamptz-interval '32 days',current_setting('admission_test.historical_now')::timestamptz-interval '32 days'+interval '1 hour',current_setting('admission_test.historical_now')::timestamptz-interval '32 days',current_setting('admission_test.historical_now')::timestamptz-interval '2 days','superseded_capture')`);
        await transaction.execute(sql`insert into public.academy_personal_invitations(id,tribe_id,created_by_user_id,internal_name,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,requires_allowlist,expires_at,token_hash,token_key_id,token_context_digest,created_at,updated_at) values (${invitationId},${fixture.tribeId},${fixture.userId},'Canje histórico coherente','email',${recipient.email},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},false,current_setting('admission_test.historical_now')::timestamptz-interval '25 days',${Buffer.from(token.lookupDigest)},${token.keyId},${Buffer.from(token.digest)},current_setting('admission_test.historical_now')::timestamptz-interval '32 days',current_setting('admission_test.historical_now')::timestamptz-interval '32 days')`);
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,invitation_id,requires_allowlist,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,evidence_source,global_identity_evidence_id,binding_id,original_policy_snapshot,submitted_at,expires_at,version) values (${requestId},${fixture.tribeId},${recipient.userId},'personal',${invitationId},false,'email',${recipient.email},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},'base',${evidenceId},${bindingId},'{"version":2,"verificationEpoch":1,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":false,"allowCommonExceptions":true}'::jsonb,current_setting('admission_test.historical_now')::timestamptz-interval '31 days',current_setting('admission_test.historical_now')::timestamptz-interval '1 day',2)`);
        await transaction.execute(sql`insert into public.academy_admission_contact_bindings(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,owner_user_id,first_request_id,evidence_source,created_at) values (${bindingId},${fixture.tribeId},'email',${recipient.email},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},${recipient.userId},${requestId},'base',current_setting('admission_test.historical_now')::timestamptz-interval '31 days')`);
        await transaction.execute(sql`update public.academy_personal_invitations set status='redeemed',version=2,redeemed_by_user_id=${recipient.userId},redeemed_request_id=${requestId},redeemed_at=current_setting('admission_test.historical_now')::timestamptz-interval '31 days',updated_at=current_setting('admission_test.historical_now')::timestamptz-interval '31 days' where id=${invitationId}`);
        await transaction.execute(sql`update public.academy_admission_policies set is_open=false,version=version+1 where tribe_id=${fixture.tribeId}`);
      });
      const before = await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select submitted_at,expires_at,invitation_id,binding_id from public.academy_admission_requests where id=${requestId}`));
      const uncertain = buildAdmissionExpirationModule({
        authorize: async () => true,
        execute: async (run) => { await database.withContext({ userId: null, email: null }, run); throw new Error("Synthetic expiration response unavailable after committed transaction"); },
      });
      await expect(uncertain.useCases.expireRequests.execute({ limit: 1 })).rejects.toMatchObject({ code: "operation_unresolved", cause: expect.any(Error) });
      expect(await expirationModule(database).useCases.expireRequests.execute({ limit: 1 })).toEqual({ expired: 0 });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select submitted_at,expires_at,invitation_id,binding_id from public.academy_admission_requests where id=${requestId}`)).rows).toEqual(before.rows);
        expect((await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ status: "expired", version: 3 }]);
        expect((await transaction.execute(sql`select status,version,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", version: 2, redeemed_request_id: requestId }]);
        expect((await transaction.execute(sql`select owner_user_id,first_request_id from public.academy_admission_contact_bindings where id=${bindingId}`)).rows).toEqual([{ owner_user_id: recipient.userId, first_request_id: requestId }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_decisions where request_id=${requestId}`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_notification_obligations where request_id=${requestId} and event_type='expired'`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.tribeId} and user_id=${recipient.userId}`)).rows).toEqual([{ count: 0 }]);
      });
    });
  }, 300_000);
});
