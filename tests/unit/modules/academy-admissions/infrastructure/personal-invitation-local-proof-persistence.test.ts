/** @vitest-environment node */
/** Exercises personal proof consumption and physical retirement without changing global identity. @module personal-invitation-local-proof-persistence-tests */
import { createHash, randomUUID } from "node:crypto";
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
      for (const migration of ["20261005100000_guard_messaging_secret_retirement.sql", "20261010100000_minimize_deleted_admission_contact_owners.sql", "20261010113000_preserve_admission_tribe_namespaces.sql", "20261010120000_archive_deleted_admission_tribe_provenance.sql", "20261010121000_retire_deleted_tribe_messaging.sql"]) await database.applyMigration(migration);
      const before = await database.withContext(fixture.own, async (transaction) => {
        const binding = (await transaction.execute<{ id: string; owner_reference_id: string }>(sql`select id,owner_reference_id from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId} and first_request_id=${requestId}`)).rows[0];
        if (!binding) throw new Error("Personal tribe retirement fixture failed: consumed_contact_binding_unavailable");
        return { binding, usage: (await transaction.execute<{ total: number }>(sql`select count(*)::int as total from public.messaging_usage_events where tribe_id=${fixture.context.tribeId}`)).rows[0].total };
      });
      /** Reads a private snapshot only to compare it in memory. @returns A private SHA256 digest; no values or digest are exported. */
      const globalIdentityChecksum = () => database.withContext(fixture.own, async (transaction) => {
        const snapshot = (await transaction.execute<{ snapshot: unknown }>(sql`select jsonb_build_object('user',(select to_jsonb(account_user) from public."user" account_user where id=${fixture.context.userId}),'accounts',(select jsonb_agg(to_jsonb(account) order by id) from public.account where "userId"=${fixture.context.userId}),'sessions',(select jsonb_agg(to_jsonb(session) order by id) from public.session where "userId"=${fixture.context.userId}),'bindings',(select jsonb_agg(to_jsonb(binding) order by session_id) from public.global_session_identity_bindings binding where user_id=${fixture.context.userId}),'evidence',(select jsonb_agg(to_jsonb(evidence) order by id) from public.global_identity_evidence evidence where user_id=${fixture.context.userId})) as snapshot`)).rows[0].snapshot;
        return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
      });
      const globalBefore = await globalIdentityChecksum();
      await expect(database.withContext(fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`delete from public.tribes where id=${fixture.context.tribeId}`);
        throw new Error("Controlled personal tribe retirement rollback");
      })).rejects.toThrow("Controlled personal tribe retirement rollback");
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${input.proofId}`)).rows).toEqual([{ status: "applied", applied_request_id: requestId }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_retired_bindings where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ total: 0 }]);
      });
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`delete from public.tribes where id=${fixture.context.tribeId}`));
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id,owner_reference_id,first_request_reference_id,first_proof_reference_id,evidence_source from public.academy_admission_retired_bindings where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ id: before.binding.id, owner_reference_id: before.binding.owner_reference_id, first_request_reference_id: requestId, first_proof_reference_id: input.proofId, evidence_source: "local" }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_personal_invitations where id=${invitationId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_verification_proofs where id=${input.proofId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.messaging_usage_events where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ total: before.usage }]);
      });
      expect((await globalIdentityChecksum()) === globalBefore).toBe(true);
    });
  }, 1_200_000);
});
