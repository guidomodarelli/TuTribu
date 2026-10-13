/** @vitest-environment node */
/** Exercises native policy invalidation racing proof attachment under observed PostgreSQL locks. @module admission-proof-policy-race-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { withAdmissionTransitionContention } from "@/tests/support/admission-transition-contention";
import { prepareAdmissionContactVerification } from "@/tests/support/admission-contact-verification-fixture";
import { recoverTestVerificationCode } from "@/tests/support/contact-verification-issuance-fixture";
import { PostgresAdmissionContactVerificationOperations } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-contact-verification-operations";
import { PostgresAdmissionPolicyRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-repository";
import { PostgresAdmissionPolicyPreparationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-preparation-reader";
import { authorizeAdmissionPolicy } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-authorizer";
import { AdmissionMessagingUsagePolicyReader } from "@/src/modules/academy-admissions/infrastructure/verification/messaging-usage-policy-reader";
import { PostgresMessagingUsageRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-usage-repository";
import { PostgresAdmissionVerificationReadinessReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-admission-verification-readiness-reader";
import { createMessagingSecretCipher } from "@/src/modules/messaging/infrastructure/encryption/messaging-secret-cipher";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import { RECENT_AUTHENTICATION_WINDOW_MS } from "@/src/modules/auth/constants/recent-authentication";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { PostgresAdmissionRequestRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-request-repository";
import { createAcademyApprovedMembershipWriter } from "@/src/modules/tribes/infrastructure/repositories/apply-approved-academy-membership";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";

/**
 * Creates action-bound native recency for the already canonical synthetic leader.
 * @param database - Exact owned branch containing the existing leader and tribe.
 * @param fixture - Native verification setup; no historic account/session is rewritten.
 * @returns Current leader context whose session and confirmation are persisted.
 */
async function confirmPolicyLeader(database: AcademyAdmissionTestDatabase, fixture: Awaited<ReturnType<typeof prepareAdmissionContactVerification>>): Promise<AuthorizedAdmissionContext> {
  const accountId = randomUUID(), subject = randomUUID(), sessionId = randomUUID(), intentId = randomUUID();
  await database.withContext(fixture.fixture.own, async (transaction) => {
    const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now), until = new Date(now.getTime() + RECENT_AUTHENTICATION_WINDOW_MS);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.fixture.userId},'google',${subject},${now},${now})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.fixture.userId},${randomUUID()},clock_timestamp()+interval '1 hour',${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.fixture.userId},${accountId},${subject},${fixture.fixture.own.email})`);
    await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.fixture.userId},${sessionId},${accountId},${subject},${fixture.context.tribeId},${REAUTHENTICATION_OPERATION.updateAdmissionPolicy},${fixture.context.tribeId},'/synthetic-policy-race',${randomBytes(32)},'consumed',${now},${until},${now})`);
    await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.fixture.userId},${accountId},${subject},${sessionId},${fixture.context.tribeId},${REAUTHENTICATION_OPERATION.updateAdmissionPolicy},${fixture.context.tribeId},${now},${now},${until})`);
  });
  return { userId: fixture.fixture.userId, sessionId, tribeId: fixture.context.tribeId, requestId: randomUUID(), role: "leader", membershipStatus: "active", resourceId: fixture.context.tribeId, action: "configure_policy", sensitiveOperation: REAUTHENTICATION_OPERATION.updateAdmissionPolicy };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native proof application during policy transitions", () => {
  it("should verify and apply a new epoch proof to the original OFF request before an explicit current approval", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database);
      await database.withContext(fixture.own, async (transaction) => {
        const available = await transaction.$client.query<{ available: boolean }>("select to_regprocedure('public.read_own_admission_request_summary(uuid,text)') is not null as available");
        if (!available.rows[0].available) {
          await transaction.$client.query("savepoint own_request_reader_diagnostic");
          await expect(transaction.$client.query("select * from public.read_own_admission_request_summary($1::uuid,$2::text)", [fixture.context.tribeId, fixture.context.sessionId])).rejects.toMatchObject({ code: "42883" });
          await transaction.$client.query("rollback to savepoint own_request_reader_diagnostic");
          await transaction.$client.query("release savepoint own_request_reader_diagnostic");
        }
      });
      for (const migration of ["20261006200000_scope_admission_audit_operations.sql", "20261006220000_extend_admission_notifications.sql", "20261006233000_index_admission_account_history.sql", "20261006234000_read_own_admission_summary.sql", "20261011024000_read_current_own_admission_eligibility.sql", "20261007005000_read_admission_reviews.sql", "20261007030000_capture_admission_decision_evidence.sql", "20261009083000_read_current_admission_review_evidence.sql"]) await database.applyMigration(migration);
      const requests = new PostgresAdmissionRequestRepository((scope, run) => database.withContext({ userId: scope.userId, email: null }, run), async () => fixture.fixture.config, (transaction) => ({ memberships: createAcademyApprovedMembershipWriter(transaction), notifications: createPostgresAdmissionNotificationObligationWriter(transaction) }));
      const submitted = await requests.submit({ ...fixture.context, operationId: randomUUID(), type: "submit_admission", confirmed: true, expectedPolicyVersion: 1, source: { kind: "common" }, contact: fixture.input.contact, proofId: null, message: null });
      if (submitted.state !== "completed" || !submitted.result.admissionRequestId) throw new Error("New epoch fixture did not produce the original OFF request");
      const requestId = submitted.result.admissionRequestId;
      const original = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select submitted_at,expires_at,normalized_contact,status,version from public.academy_admission_requests where id=${requestId}`)).rows[0]);
      const context = await confirmPolicyLeader(database, fixture);
      const policy = new PostgresAdmissionPolicyRepository((authority, run) => database.withContext({ userId: authority.userId, email: null }, run), async () => fixture.fixture.config, (transaction, authority) => {
        /** @param current - Native preparation transaction. @param tribeId - Exact own policy tribe. @returns Current scoped authority after native recency and leader checks. */
        const authorize = async (current: RequestDatabase, tribeId: string) => { if (tribeId !== authority.tribeId) return false; await authorizeAdmissionPolicy(current, authority, authority.sensitiveOperation); return true; };
        // The preflight port is separately verified; usage, readiness, security and policy authority stay native.
        return new PostgresAdmissionPolicyPreparationReader(transaction, { isPrepared: async () => true }, new AdmissionMessagingUsagePolicyReader(new PostgresMessagingUsageRepository(transaction, authorize)), new PostgresAdmissionVerificationReadinessReader(transaction, authorize, async () => fixture.fixture.config), async () => fixture.fixture.config);
      });
      expect(await policy.update({ context, operationId: randomUUID(), type: "update_admission_policy", confirmed: true, expectedVersion: 1, patch: { requiresAdditionalVerification: true } })).toMatchObject({ state: "completed", result: { version: 2, verificationEpoch: 2 } });
      const decision = { userId: context.userId, sessionId: context.sessionId, tribeId: context.tribeId, requestId: randomUUID(), operationId: randomUUID(), type: "decide_admission_request" as const, confirmed: true as const, admissionRequestId: requestId, expectedVersion: 1, decision: "approve" as const, internalReason: "Revisión explícita de nueva época", externalMessage: null };
      await expect(requests.decide(decision)).rejects.toMatchObject({ code: "admission_ineligible" });
      const operations = new PostgresAdmissionContactVerificationOperations((scope, run) => database.withContext({ userId: scope.userId, email: null }, run), async () => fixture.fixture.config);
      const issued = await operations.issue({ ...fixture.input, operationId: randomUUID(), expectedPolicyVersion: 2, admissionRequestId: requestId });
      if (issued.state !== "completed") throw new Error("New epoch fixture did not commit its own challenge");
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 };
      const recovered = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.result.challengeId);
      const verified = await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: recovered.code });
      if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("New epoch fixture did not produce its own proof");
      const proofId = verified.result.proofId;
      expect(await operations.apply({ ...fixture.context, admissionRequestId: requestId, proofId, operationId: randomUUID(), expectedRequestVersion: 1 })).toMatchObject({ state: "completed", result: { outcome: "applied", requestId, requestVersion: 2 } });
      const applied = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select submitted_at,expires_at,normalized_contact,status,version,proof_id from public.academy_admission_requests where id=${requestId}`)).rows[0]);
      expect(applied).toMatchObject({ ...original, status: "pending", version: 2, proof_id: proofId });
      const currentDecision = { ...decision, operationId: randomUUID(), expectedVersion: 2 };
      expect(await requests.decide(currentDecision)).toMatchObject({ state: "completed", result: { status: "approved", version: 3 } });
      expect(await requests.decide(currentDecision)).toMatchObject({ state: "completed", replayed: true, result: { status: "approved", version: 3 } });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        const final = (await transaction.execute(sql`select submitted_at,expires_at,normalized_contact,status,version,proof_id from public.academy_admission_requests where id=${requestId}`)).rows[0];
        expect(final).toMatchObject({ ...applied, status: "approved", version: 3 });
        const effects = (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}) as requests,(select count(*)::int from public.academy_admission_verification_proofs where id=${proofId} and status='applied' and applied_request_id=${requestId}) as applied_proofs,(select count(*)::int from public.tribe_members where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}) as memberships,(select count(*)::int from public.academy_admission_decisions where request_id=${requestId}) as decisions`)).rows[0];
        expect(effects).toEqual({ requests: 1, applied_proofs: 1, memberships: 1, decisions: 1 });
      });
    });
  }, 1_200_000);

  it.each(["epoch", "connection"] as const)("should preserve the pending deadline and reject old proof after the competing %s transition commits", async (change) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionContactVerification(database), requestId = randomUUID();
      await database.applyMigration("20261006200000_scope_admission_audit_operations.sql");
      await database.withContext(fixture.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set requires_additional_verification=true,verification_epoch=verification_epoch+1,version=version+1 where tribe_id=${fixture.context.tribeId}`));
      const operations = new PostgresAdmissionContactVerificationOperations((_scope, run) => database.withContext(fixture.own, run), async () => fixture.fixture.config);
      const issued = await operations.issue({ ...fixture.input, expectedPolicyVersion: 2 });
      if (issued.state !== "completed") throw new Error("Admission policy race failed: original_challenge_unavailable");
      const scope = { ...fixture.fixture.scope, userId: fixture.context.userId, contact: fixture.input.contact, verificationEpoch: 2 };
      const code = await recoverTestVerificationCode(database, { ...fixture.fixture, own: fixture.own, scope }, issued.result.challengeId);
      const verified = await operations.verify({ ...fixture.context, operationId: randomUUID(), challengeId: issued.result.challengeId, verificationCode: code.code });
      if (verified.state !== "completed" || verified.result.result !== "verified") throw new Error("Admission policy race failed: original_proof_unavailable");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`with instant as(select clock_timestamp() as now) insert into public.academy_admission_requests(id,tribe_id,user_id,source,evidence_source,submitted_at,expires_at) select ${requestId},${fixture.context.tribeId},${fixture.context.userId},'common','none',now-interval '1 day',now+interval '29 days' from instant`));
      const original = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select submitted_at,expires_at,status,version,contact_type,normalized_contact,proof_id,binding_id from public.academy_admission_requests where id=${requestId}`)).rows[0]);
      const context = await confirmPolicyLeader(database, fixture);
      const input = { ...fixture.context, admissionRequestId: requestId, proofId: verified.result.proofId, operationId: randomUUID(), expectedRequestVersion: 1 };
      const result = await withAdmissionTransitionContention(database, fixture.fixture.own, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${fixture.context.tribeId} for update`);
        const authorize = async (current: RequestDatabase, tribeId: string) => { if (tribeId !== context.tribeId) return false; await authorizeAdmissionPolicy(current, context, context.sensitiveOperation); return true; };
        // Preflight belongs to a separately tested owner; current native scope,
        // usage, readiness, recency, ledger and invalidation remain real here.
        const writer = new PostgresAdmissionPolicyRepository((_context, run) => run(transaction), async () => fixture.fixture.config, (current) => new PostgresAdmissionPolicyPreparationReader(current, { isPrepared: async () => true }, new AdmissionMessagingUsagePolicyReader(new PostgresMessagingUsageRepository(current, authorize)), new PostgresAdmissionVerificationReadinessReader(current, authorize, async () => fixture.fixture.config), async () => fixture.fixture.config));
        if (change === "epoch") {
          expect(await writer.update({ context, operationId: randomUUID(), type: "update_admission_policy", confirmed: true, expectedVersion: 2, patch: { requiresAdditionalVerification: false } })).toMatchObject({ state: "completed" });
          expect(await writer.update({ context, operationId: randomUUID(), type: "update_admission_policy", confirmed: true, expectedVersion: 3, patch: { requiresAdditionalVerification: true } })).toMatchObject({ state: "completed" });
        } else {
          const secretRef = randomUUID(), envelope = await createMessagingSecretCipher(fixture.fixture.config).seal(fixture.fixture.credential, { tribeId: fixture.context.tribeId, connectionId: fixture.fixture.scope.connectionId, connectionVersion: 2, resourceId: secretRef });
          await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,secret_ref,email_sender_id,sms_sender_id,credential_validation_status,credential_validated_at,is_test_mode) select connection_id,tribe_id,2,environment,security_epoch,${secretRef},email_sender_id,sms_sender_id,credential_validation_status,clock_timestamp(),is_test_mode from public.messaging_connection_versions where connection_id=${fixture.fixture.scope.connectionId} and tribe_id=${fixture.context.tribeId} and version=1`);
          await transaction.execute(sql`insert into public.messaging_secret_envelopes(secret_ref,tribe_id,connection_id,connection_version,environment,security_epoch,key_id,iv,ciphertext) values (${secretRef},${fixture.context.tribeId},${fixture.fixture.scope.connectionId},2,${envelope.environment},${envelope.securityEpoch},${envelope.keyId},${Buffer.from(envelope.iv)},${Buffer.from(envelope.ciphertext)})`);
          await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,state,checked_at,tested_at) values (${fixture.context.tribeId},${fixture.fixture.scope.connectionId},2,'email',${fixture.fixture.emailSenderId},'prepared',clock_timestamp(),clock_timestamp())`);
          await transaction.execute(sql`update public.tenant_messaging_connections set selected_version=2,version=version+1 where id=${fixture.fixture.scope.connectionId}`);
          expect(await writer.update({ context, operationId: randomUUID(), type: "update_admission_policy", confirmed: true, expectedVersion: 2, patch: { messagingConnectionVersion: 2 } })).toMatchObject({ state: "completed" });
        }
      }, () => operations.apply(input));
      if (change === "epoch") expect(result).toMatchObject({ status: "rejected", reason: { code: "challenge_invalidated" } });
      else expect(result).toMatchObject({ status: "fulfilled", value: { state: "completed", result: { outcome: "denied", code: "proof_unavailable" } } });
      await database.withContext(fixture.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select submitted_at,expires_at,status,version,contact_type,normalized_contact,proof_id,binding_id from public.academy_admission_requests where id=${requestId}`)).rows).toEqual([original]);
        expect((await transaction.execute(sql`select status,applied_request_id,invalidated_at is not null as invalidated from public.academy_admission_verification_proofs where id=${input.proofId}`)).rows).toEqual([{ status: "invalid", applied_request_id: null, invalidated: true }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_contact_bindings where tribe_id=${fixture.context.tribeId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.academy_admission_audit_events where resource_id=${requestId}`)).rows).toEqual([{ count: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.tribe_members where tribe_id=${fixture.context.tribeId} and user_id=${fixture.context.userId}`)).rows).toEqual([{ count: 0 }]);
      });
    }, { concurrentTransactions: 4 });
  }, 1_200_000);
});
