/** @vitest-environment node */
/** Exercises actual email/phone proof consumption during personal submission with no external provider request. @module personal-invitation-local-proof-persistence-tests */
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

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal ON proof consumption", () => {
  for (const phone of [false, true]) it(`should atomically consume the real ${phone ? "phone" : "email"} proof and personal link into one approved recipient`, async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database, false, undefined, phone), invitationId = randomUUID();
      for (const migration of ["20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261007030000_capture_admission_decision_evidence.sql", "20261009082000_capture_automatic_allowlist_authorization.sql", "20261009130000_add_personal_invitation_context_digest.sql"]) await database.applyMigration(migration);
      const token = await createPersonalInvitationTokenCodec(fixture.fixture.config).issue({ tribeId: fixture.context.tribeId, invitationId });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.academy_admission_policies set mode='allowlist',requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`);
        if (phone) await transaction.execute(sql`update public.messaging_usage_policies set allowed_countries=array['AR'],version=version+1 where tribe_id=${fixture.context.tribeId}`);
        const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        const invitation = createPersonalInvitation({ id: invitationId, tribeId: fixture.context.tribeId, actorUserId: fixture.fixture.userId, contact: fixture.input.contact, internalName: "Prueba personal ON", requiresAllowlist: false, allowlistExemptionAcknowledged: true, now, policy: { contactType: fixture.input.contact.type, requiresAdditionalVerification: true } });
        const fingerprint = await createAdmissionContactFingerprint(invitation.contact, fixture.fixture.config);
        // Seed only the valid issued resource. Code issue/verify and all later
        // proof, link, request, membership and notice effects stay native.
        await transaction.execute(sql`insert into public.academy_personal_invitations(id,tribe_id,created_by_user_id,internal_name,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,requires_allowlist,expires_at,token_hash,token_key_id,token_context_digest,created_at,updated_at) values (${invitation.id},${invitation.tribeId},${invitation.createdByUserId},${invitation.internalName},${invitation.contact.type},${invitation.contact.value},${Buffer.from(fingerprint.digest)},${fingerprint.keyId},false,${invitation.expiresAt},${Buffer.from(token.lookupDigest)},${token.keyId},${Buffer.from(token.digest)},${now},${now})`);
      });
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const issued = await operations.issue({ ...fixture.input, expectedPolicyVersion: 2 });
      if (issued.state !== "completed") throw new Error("Expected native common-step proof before separate personal confirmation");
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 };
      const code = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.result.challengeId);
      const verified = await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: code.code });
      if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("Expected actual personal-compatible local proof");
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.context.userId, sessionId: fixture.context.sessionId }), (_identity, run) => database.withContext(fixture.own, run));
      const commands = buildAcademyAdmissionsModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createManualRequestModule({ readSecurityConfig: async () => fixture.fixture.config }).useCases;
      const input = { tribeId: fixture.context.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedPolicyVersion: 2, confirmed: true as const, proofId: verified.result.proofId, invitationToken: token.token, ...(phone ? { phone: fixture.input.contact.value, country: "AR" } : {}) };
      const submitted = await commands.submit.execute(input);
      expect(submitted).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "admitted", membership: { role: "tribemate", status: "active" } } } });
      if (!submitted.ok || submitted.value.state !== "completed") throw new Error("Expected native personal local-proof admission");
      const requestId = submitted.value.result.admissionRequestId;
      expect(await commands.submit.execute(input)).toMatchObject({ ok: true, value: { state: "completed", replayed: true, result: submitted.value.result } });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${input.proofId}`)).rows).toEqual([{ status: "applied", applied_request_id: requestId }]);
        expect((await transaction.execute(sql`select status,version,redeemed_request_id from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ status: "redeemed", version: 2, redeemed_request_id: requestId }]);
        expect((await transaction.execute(sql`select source,evidence_source,status from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ source: "personal", evidence_source: "local", status: "approved" }]);
        expect((await transaction.execute(sql`select event_type from public.academy_admission_notification_obligations where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ event_type: "approved" }]);
      });
    });
  }, 1_200_000);
});
