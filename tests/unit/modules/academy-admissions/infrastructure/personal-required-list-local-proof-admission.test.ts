/** @vitest-environment node */
/** Exercises exact required-list personal admission with real local proof and original denial recovery. @module personal-required-list-local-proof-admission-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import { createPersonalInvitation } from "@/src/modules/academy-admissions/domain/entities/personal-invitation";
import { createPersonalInvitationTokenCodec } from "@/src/modules/academy-admissions/infrastructure/tokens/personal-invitation-token";
import { createAdmissionContactFingerprint } from "@/src/modules/academy-admissions/infrastructure/verification/admission-contact-fingerprint";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native required-list personal ON admission", () => {
  it.each([false, true])("should preserve personal denial and proof for phone=%s until an exact list entry and a new confirmed presentation", async (phone) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, phone);
      for (const migration of ["20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007030000_capture_admission_decision_evidence.sql", "20261009082000_capture_automatic_allowlist_authorization.sql", "20261009130000_add_personal_invitation_context_digest.sql", "20261009180000_bind_personal_verification_challenges.sql"]) await database.applyMigration(migration);
      const invitationId = randomUUID(), entryId = randomUUID();
      const token = await createPersonalInvitationTokenCodec(fixture.fixture.config).issue({ tribeId: fixture.context.tribeId, invitationId });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_admission_policies set mode='allowlist',allow_common_exceptions=true,requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        if (phone) await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=array['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        const invitation = createPersonalInvitation({ id: invitationId, tribeId: fixture.context.tribeId, actorUserId: fixture.fixture.userId, contact: fixture.input.contact, internalName: "Ingreso sujeto a lista y código", requiresAllowlist: true, allowlistExemptionAcknowledged: false, now, policy: { contactType: fixture.input.contact.type, requiresAdditionalVerification: true } });
        const fingerprint = await createAdmissionContactFingerprint(invitation.contact, fixture.fixture.config);
        await transaction.execute(sql`insert into public.academy_personal_invitations(id,tribe_id,created_by_user_id,internal_name,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,requires_allowlist,expires_at,token_hash,token_key_id,token_context_digest,created_at,updated_at) values(${invitation.id},${invitation.tribeId},${invitation.createdByUserId},${invitation.internalName},${invitation.contact.type},${invitation.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},true,${invitation.expiresAt},${Buffer.from(token.lookupDigest)},${token.keyId},${Buffer.from(token.digest)},${now},${now})`);
        await transaction.execute(sql`insert into public.academy_allowlist_entries(id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,display_name,origin,created_by_user_id,updated_by_user_id) values(${entryId},${invitation.tribeId},${invitation.contact.type},${invitation.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},'Entrada personal exacta','manual',${fixture.fixture.userId},${fixture.fixture.userId})`);
      });
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const issued = await operations.issue({ ...fixture.input, expectedPolicyVersion: 2, source: { kind: "personal", token: token.token } });
      if (issued.state !== "completed") throw new Error("Required-list ON fixture failed: original_challenge_unavailable");
      const code = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope: { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 } }, issued.result.challengeId);
      const verified = await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: code.code });
      if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("Required-list ON fixture failed: local_proof_unavailable");
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.userId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const commands = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.fixture.config }).useCases;
      const input = { tribeId: fixture.context.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 2, confirmed: true as const, proofId: verified.result.proofId, invitationToken: token.token, message: "La explicación no dispensa esta lista personal.", ...(phone ? { phone: fixture.input.contact.value, country: "AR" } : {}) };
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_allowlist_entries set status='disabled',version=version+1,updated_by_user_id=${fixture.fixture.userId},updated_at=clock_timestamp() where id=${entryId} and version=1`));
      expect(await commands.submit.execute(input)).toMatchObject({ ok: false, failure: { code: "admission_ineligible", operation: { state: "completed" } } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "active", version: 1 }]);
        expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${input.proofId}`)).rows).toEqual([{ status: "available", applied_request_id: null }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_requests where tribe_id=${input.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_contact_bindings where tribe_id=${input.tribeId} and owner_user_id=${fixture.context.userId}`)).rows).toEqual([{ total: 0 }]);
      });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_allowlist_entries set status='enabled',version=version+1,updated_by_user_id=${fixture.fixture.userId},updated_at=clock_timestamp() where id=${entryId} and version=2`);
        expect((await transaction.execute(sql`select status,version from public.academy_allowlist_entries where id=${entryId}`)).rows).toEqual([{ status: "enabled", version: 3 }]);
      });
      expect(await commands.submit.execute(input)).toMatchObject({ ok: false, failure: { code: "admission_ineligible", operation: { state: "completed" } } });
      const admittedInput = { ...input, operationId: randomUUID() };
      const admitted = await commands.submit.execute(admittedInput);
      expect(admitted).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "admitted", membership: { role: "tribemate", status: "active" } } } });
      if (!admitted.ok || admitted.value.state !== "completed") throw new Error("Required-list ON fixture failed: confirmed_admission_unavailable");
      const requestId = admitted.value.result.admissionRequestId;
      expect(await commands.submit.execute(admittedInput)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: admitted.value.result } });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", redeemed_request_id: requestId }]);
        expect((await transaction.execute(sql`select actor_kind,allowlist_entry_id,allowlist_entry_version from public.academy_admission_decisions where request_id=${requestId}`)).rows).toEqual([{ actor_kind: "system", allowlist_entry_id: entryId, allowlist_entry_version: 3 }]);
        expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${input.proofId}`)).rows).toEqual([{ status: "applied", applied_request_id: requestId }]);
        expect((await transaction.execute(sql`select event_type from public.academy_admission_notification_obligations where request_id=${requestId}`)).rows).toEqual([{ event_type: "approved" }]);
      });
    });
  }, 1_200_000);
});
