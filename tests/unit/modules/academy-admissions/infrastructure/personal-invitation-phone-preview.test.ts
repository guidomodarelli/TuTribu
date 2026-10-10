/** @vitest-environment node */
/** Exercises phone-ON preview with actual current channel/country facts without granting access or issuing a code. @module personal-invitation-phone-preview-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { createPersonalInvitation } from "@/src/modules/academy-admissions/domain/entities/personal-invitation";
import { createPersonalInvitationTokenCodec } from "@/src/modules/academy-admissions/infrastructure/tokens/personal-invitation-token";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native phone personal preview", () => {
  it("should offer the current phone verification step without revealing its destination or creating proof, binding, request or code effects", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, true), invitationId = randomUUID();
      for (const migration of ["20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007001000_read_public_admission_overview.sql", "20261008230000_read_admission_contact_choices.sql", "20261009130000_add_personal_invitation_context_digest.sql"]) await database.applyMigration(migration);
      const token = await createPersonalInvitationTokenCodec(fixture.fixture.config).issue({ tribeId: fixture.context.tribeId, invitationId });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_admission_policies set mode='allowlist',requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=array['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        const invitation = createPersonalInvitation({ id: invitationId, tribeId: fixture.context.tribeId, actorUserId: fixture.fixture.userId, contact: fixture.input.contact, internalName: "Teléfono privado", requiresAllowlist: false, allowlistExemptionAcknowledged: true, now, policy: { contactType: "phone", requiresAdditionalVerification: true } });
        const fingerprint = await createAdmissionContactFingerprint(invitation.contact, fixture.fixture.config);
        await transaction.execute(sql`insert into public.academy_personal_invitations(id,tribe_id,created_by_user_id,internal_name,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,requires_allowlist,expires_at,token_hash,token_key_id,token_context_digest,created_at,updated_at) values (${invitation.id},${invitation.tribeId},${invitation.createdByUserId},${invitation.internalName},'phone',${invitation.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},false,${invitation.expiresAt},${Buffer.from(token.lookupDigest)},${token.keyId},${Buffer.from(token.digest)},${now},${now})`);
      });
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.userId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const preview = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createPersonalInvitationQueryModule({ readSecurityConfig: async () => fixture.fixture.config }).useCases.overview;
      const value = await preview.execute({ token: token.token, requestId: randomUUID() });
      expect(value).toMatchObject({ ok: true, value: { state: "available", overview: { state: "verification_required", nextAction: "verify_contact", verification: { channel: "sms", allowedCountries: ["AR"] } } } });
      expect(JSON.stringify(value)).not.toContain(fixture.input.contact.value); expect(JSON.stringify(value)).not.toContain(token.token); expect(JSON.stringify(value)).not.toContain("Teléfono privado");
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "active", version: 1, redeemed_request_id: null }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.context.tribeId}) as requests,(select count(*)::int from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId}) as bindings,(select count(*)::int from public.contact_verification_challenges where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}) as challenges`)).rows).toEqual([{ requests: 0, bindings: 0, challenges: 0 }]);
      });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        const priorRequestId = randomUUID(), fingerprint = await createAdmissionContactFingerprint(fixture.input.contact, fixture.fixture.config);
        // Native historical ownership fixture, with reciprocal request/binding
        // references and unchanged current invitation. Preview cannot transfer it.
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,submitted_at,expires_at) values (${priorRequestId},${fixture.context.tribeId},${fixture.fixture.userId},'common','phone',${fixture.input.contact.value},'declared','{"version":2,"verificationEpoch":2,"mode":"allowlist","contactType":"phone","requiresAdditionalVerification":true,"allowCommonExceptions":false}'::jsonb,clock_timestamp(),clock_timestamp()+interval '29 days')`);
        const binding = (await transaction.execute<{ id: string }>(sql`insert into public.academy_admission_contact_bindings(tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,owner_user_id,first_request_id,evidence_source) values (${fixture.context.tribeId},'phone',${fixture.input.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},${fixture.fixture.userId},${priorRequestId},'base') returning id`)).rows[0];
        await transaction.execute(sql`update public.academy_admission_requests set binding_id=${binding.id},version=version+1 where id=${priorRequestId}`);
      });
      expect(await preview.execute({ token: token.token, requestId: randomUUID(), proofId: randomUUID() })).toMatchObject({ ok: true, value: { state: "unavailable" } });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select owner_user_id from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId} and normalized_contact=${fixture.input.contact.value}`)).rows).toEqual([{ owner_user_id: fixture.fixture.userId }]);
        expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "active", version: 1 }]);
      });
    });
  }, 1_200_000);
});
