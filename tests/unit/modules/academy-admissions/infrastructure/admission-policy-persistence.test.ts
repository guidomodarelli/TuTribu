/** @vitest-environment node */
/** Exercises native SQL policy commands and their original ledger, with doubles only of the preparation port. @module admission-policy-persistence-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { PostgresAdmissionPolicyRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-repository";
import { PostgresAdmissionPolicyReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-reader";
import { AdmissionMessagingUsagePolicyReader } from "@/src/modules/academy-admissions/infrastructure/verification/messaging-usage-policy-reader";
import { PostgresMessagingUsageRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-usage-repository";
import { authorizeAdmissionPolicy } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-policy-authorizer";
import { REAUTHENTICATION_OPERATION, type ReauthenticationOperation } from "@/src/modules/auth/constants/reauthentication-resources";
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildAcademyAdmissionsModule } from "@/src/modules/academy-admissions/setup";
import { PostgresAdmissionVerificationProofWriter } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-verification-proof-writer";
import { ADMISSION_PROOF_OPERATION } from "@/src/modules/academy-admissions/constants/admission-proof";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { z } from "zod";
import { PostgresAdmissionOperationReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-reader";
import { ReadAdmissionOperationUseCase } from "@/src/modules/academy-admissions/application/use-cases/read-admission-operation-use-case";
import { PostgresAdmissionActivationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-activation-repository";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { makeSignature } from "better-auth/crypto";
import { chromium, webkit } from "@playwright/test";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { join } from "node:path";

/** @param database - This run's owned branch with native pg/Drizzle. @returns Current signed leader, policy repository and preparation-port controls. */
async function preparePolicy(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareContactVerificationDatabase(database);
  for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005093000_guard_academy_membership_sources.sql", "20261005095000_guard_global_identity_context.sql", "20261005101000_guard_admission_operation_identity.sql", "20261006200000_scope_admission_audit_operations.sql"]) await database.applyMigration(migration);
  const tribeId = randomUUID(), accountId = randomUUID(), sessionId = randomUUID(), subject = randomUUID(), sessionToken = randomUUID();
  await database.withContext(fixture.own, async (transaction) => {
    const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now), until = new Date(now.getTime() + 540_000);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic policy tribe',${`policy-${tribeId}`},${fixture.userId})`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.userId},'leader','active')`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},'google',${subject},${now},${now})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${sessionToken},${new Date(now.getTime()+3_600_000)},${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
    for (const operation of [REAUTHENTICATION_OPERATION.updateAdmissionPolicy, REAUTHENTICATION_OPERATION.activateAdmissionPolicy, REAUTHENTICATION_OPERATION.pauseAdmissionPolicy]) {
      const intentId = randomUUID();
      await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.userId},${sessionId},${accountId},${subject},${tribeId},${operation},${tribeId},'/synthetic-policy',${randomBytes(32)},'consumed',${now},${until},${now})`);
      await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.userId},${accountId},${subject},${sessionId},${tribeId},${operation},${tribeId},${now},${now},${until})`);
    }
  });
  const base = { userId: fixture.userId, sessionId, tribeId, requestId: randomUUID(), role: "leader" as const, membershipStatus: "active" as const, resourceId: tribeId };
  const readContext: AuthorizedAdmissionContext = { ...base, action: "read_policy" };
  const context = (operation: ReauthenticationOperation): AuthorizedAdmissionContext => ({ ...base, action: "configure_policy", sensitiveOperation: operation });
  let preflightComplete = true, preparationCalls = 0, loseReply = false, failPreparation = false, channelPrepared = false, retireReadinessAfterRead = false;
  const execute = async <Result>(_context: AuthorizedAdmissionContext, work: (transaction: RequestDatabase) => Promise<Result>) => {
    const result = await database.withContext(fixture.own, work);
    if (loseReply && typeof result === "object" && result !== null && "state" in result && result.state === "completed") { loseReply = false; throw new Error("Synthetic policy COMMIT response lost"); }
    return result;
  };
  const repository = new PostgresAdmissionPolicyRepository(execute, async () => fixture.config, (transaction) => ({ read: async (policy) => {
    preparationCalls++;
    if (failPreparation) throw new Error("Synthetic preparation owner unavailable");
    const activated = (await transaction.execute<{ activated: boolean }>(sql`select admissions_control_activated_at is not null as activated from public.tribes where id=${tribeId}`)).rows[0].activated;
    const prepared = channelPrepared;
    if (retireReadinessAfterRead) channelPrepared = false;
    return { tribeId, isAcademy: true, controlActivated: activated, preflightComplete, evaluatorEnabled: true, recoveryLocked: false, configuration: { tribeId, channelPrepared: prepared, verificationQuotaPositive: true, usagePolicy: null, lockedContactType: policy.activatedAt ? policy.contactType : null } };
  } }));
  const reader = new PostgresAdmissionPolicyReader(execute, (transaction, current) => new AdmissionMessagingUsagePolicyReader(new PostgresMessagingUsageRepository(transaction, async (database, requestedTribeId) => { if (requestedTribeId !== current.tribeId) return false; await authorizeAdmissionPolicy(database, current); return true; })));
  const initialize = (operationId = randomUUID()) => repository.initialize({ context: context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId, confirmed: true, type: "initialize_admission_policy" });
  return { fixture, tribeId, sessionId, sessionToken, repository, reader, context, readContext, initialize, preparationCount: () => preparationCalls, setPreflight: (value: boolean) => { preflightComplete = value; }, setPreparationFailure: (value: boolean) => { failPreparation = value; }, loseNextReply: () => { loseReply = true; }, setPrepared: (value: boolean) => { channelPrepared = value; }, retirePreparedAfterRead: () => { channelPrepared = true; retireReadinessAfterRead = true; } };
}

describe.skipIf(process.env.ACADEMY_ADMISSION_SQL_TESTS !== "1")("native admission policy persistence", () => {
  it("should inspect actual guarded cutover storage and keep incomplete runtime or disabled provenance closed", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database); await data.initialize();
      let runtimePrepared = false;
      const inventory = () => database.withContext(data.fixture.own, (transaction) => new PostgresAdmissionActivationRepository(transaction, data.readContext, { isPrepared: async () => runtimePrepared }).read(data.readContext));
      expect(await inventory()).toMatchObject({ tribeId: data.tribeId, isAcademy: true, policyPresent: true, markerConsistent: true, storagePrepared: false, ingressProtected: false, runtimePrepared: false });
      for (const migration of ["20261006180000_guard_subscription_membership_sources.sql", "20261007020000_resolve_paid_admission_requests.sql", "20261007023000_close_unavailable_admission_requests.sql"]) await database.applyMigration(migration);
      const current = await inventory();
      expect(current).toMatchObject({ storagePrepared: true, ingressProtected: true, runtimePrepared: false, unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 });
      const prepared = () => database.withContext(data.fixture.own, (transaction) => new PostgresAdmissionActivationRepository(transaction, data.readContext, { isPrepared: async () => runtimePrepared }).isPrepared(data.tribeId));
      expect(await prepared()).toBe(false);
      runtimePrepared = true;
      expect(await prepared()).toBe(true);
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`alter table public.tribe_members disable trigger academy_membership_source_guard`));
      expect(await inventory()).toMatchObject({ storagePrepared: false });
      expect(await prepared()).toBe(false);
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`alter table public.tribe_members enable trigger academy_membership_source_guard`));
      expect(await prepared()).toBe(true);
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`grant execute on function public.close_unavailable_admission_request(uuid,text,text) to public`));
      expect(await prepared()).toBe(false);
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`revoke all on function public.close_unavailable_admission_request(uuid,text,text) from public`));
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`alter function public.close_unavailable_admission_request(uuid,text,text) set search_path=public`));
      expect(await prepared()).toBe(false);
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`alter function public.close_unavailable_admission_request(uuid,text,text) set search_path=pg_catalog,public`));
      expect(await prepared()).toBe(true);
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: data.fixture.userId, sessionId: data.sessionId }), (_identity, work) => database.withContext(data.fixture.own, work));
      const preview = buildAcademyAdmissionsModule({ accounts, execute: (_account, work) => database.withContext(data.fixture.own, work), clock: () => new Date() }).createPreflightModule({ runtime: { isPrepared: async () => false } }).useCases;
      expect(await preview.execute({ tribeId: data.tribeId, requestId: randomUUID() })).toEqual({ ok: true, value: { prepared: false, reasons: ["preflight_runtime_unavailable"], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 } } });
    });
  }, 300_000);

  it("should retain unknown and privileged commercial history without backfill and reject a foreign inventory scope", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database); await data.initialize();
      for (const migration of ["20261006180000_guard_subscription_membership_sources.sql", "20261007020000_resolve_paid_admission_requests.sql", "20261007023000_close_unavailable_admission_requests.sql"]) await database.applyMigration(migration);
      const unknownId = randomUUID(), privilegedId = randomUUID();
      await database.withContext(data.fixture.own, async (transaction) => {
        for (const userId of [unknownId, privilegedId]) await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic preflight account',${`${userId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status,status_reason,commercial_recovery_status) values (${data.tribeId},${unknownId},'tribemate','removed','subscription_inactive',null),(${data.tribeId},${privilegedId},'guardian','removed','payment_blocked','muted')`);
      });
      const before = await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select user_id,role,status,status_reason,commercial_recovery_status from public.tribe_members where tribe_id=${data.tribeId} and user_id in (${unknownId},${privilegedId}) order by user_id`)).rows);
      const observed = await database.withContext(data.fixture.own, async (transaction) => {
        const repository = new PostgresAdmissionActivationRepository(transaction, data.readContext, { isPrepared: async () => true });
        const inventory = await repository.read(data.readContext);
        expect(await repository.isPrepared(data.tribeId)).toBe(false);
        await expect(repository.isPrepared(randomUUID())).rejects.toMatchObject({ code: "permission_denied" });
        return inventory;
      });
      expect(observed).toMatchObject({ unknownCommercialMemberCount: 1, privilegedCommercialMemberCount: 1 });
      expect(observed).toMatchObject({ storagePrepared: true, ingressProtected: true, runtimePrepared: true });
      expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select user_id,role,status,status_reason,commercial_recovery_status from public.tribe_members where tribe_id=${data.tribeId} and user_id in (${unknownId},${privilegedId}) order by user_id`)).rows)).toEqual(before);
      expect(observed).not.toHaveProperty("members");
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${data.tribeId} and user_id=${data.fixture.userId}`));
      await expect(database.withContext(data.fixture.own, (transaction) => new PostgresAdmissionActivationRepository(transaction, data.readContext, { isPrepared: async () => true }).read(data.readContext))).rejects.toMatchObject({ code: "permission_denied" });
    });
  }, 300_000);

  it("should compose current policy absence and protected loss through native query owners without recency or secret access", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database);
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: data.fixture.userId, sessionId: data.sessionId }), (_identity, work) => database.withContext(data.fixture.own, work));
      const policy = buildAcademyAdmissionsModule({ accounts, execute: (_account, work) => database.withContext(data.fixture.own, work), clock: () => new Date() }).createPolicyQueryModule({ composePreparation: null }).useCases;
      const query = { tribeId: data.tribeId, requestId: randomUUID() };
      expect(await policy.execute(query)).toMatchObject({ ok: true, value: { state: "not_configured", policy: null, controlActivated: false, preparation: { state: "not_evaluated" }, impact: { pendingRequestCount: 0 } } });
      await data.initialize();
      await data.repository.activate({ context: data.context(REAUTHENTICATION_OPERATION.activateAdmissionPolicy), operationId: randomUUID(), confirmed: true, type: "activate_admission_policy", expectedVersion: 1 });
      await database.withContext(data.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where user_id=${data.fixture.userId} and tribe_id=${data.tribeId}`);
        await transaction.execute(sql`delete from public.academy_admission_policies where tribe_id=${data.tribeId}`);
      });
      expect(await policy.execute(query)).toMatchObject({ ok: true, value: { state: "unavailable", policy: null, controlActivated: true, preparation: { state: "not_evaluated" }, impact: { contactTypeLocked: true, historicalLinksProtected: true } } });
      expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as policies from public.academy_admission_policies where tribe_id=${data.tribeId}`)).rows)).toEqual([{ policies: 0 }]);
    });
  }, 240_000);

  it("should recover only the current leader's original policy operation without renewing its registry or replacing today's policy", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database); await database.applyMigration("20261007002000_read_own_admission_operations.sql");
      const operationId = randomUUID(); await data.initialize(operationId);
      await data.repository.update({ context: data.context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: randomUUID(), confirmed: true, type: "update_admission_policy", expectedVersion: 1, patch: { requiresAdditionalVerification: true } });
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: data.fixture.userId, sessionId: data.sessionId }), (_identity, work) => database.withContext(data.fixture.own, work));
      const reader = new PostgresAdmissionOperationReader((scope, work) => database.withContext({ userId: scope.userId, email: null }, work));
      const recovery = new ReadAdmissionOperationUseCase(accounts, reader, () => new Date()), query = { tribeId: data.tribeId, operationId, requestId: randomUUID() };
      const registry = () => database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select state,version,lease_owner,lease_until,completed_at,public_result from public.academy_admission_operations where tribe_id=${data.tribeId} and idempotency_key=${operationId}`)).rows);
      const original = await registry();
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where user_id=${data.fixture.userId} and tribe_id=${data.tribeId}`));
      expect(await recovery.execute(query)).toMatchObject({ ok: true, value: { type: "initialize_admission_policy", state: "completed", replayed: true, result: { version: 1, verificationEpoch: 1, controlActivated: false } } });
      expect(await data.reader.read(data.readContext)).toMatchObject({ policy: { version: 2, verificationEpoch: 2 } });
      expect(await registry()).toEqual(original);
      expect(await recovery.execute({ ...query, operationId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "resource_unavailable" } });
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${data.tribeId} and user_id=${data.fixture.userId}`));
      expect(await recovery.execute(query)).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
      expect(await registry()).toEqual(original);
    });
  }, 240_000);

  it("should invalidate only unused admission evidence while preserving an applied proof and original pending lifetime", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database); await data.initialize();
      await data.repository.update({ context: data.context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: randomUUID(), confirmed: true, type: "update_admission_policy", expectedVersion: 1, patch: { requiresAdditionalVerification: true } });
      data.setPrepared(true);
      await data.repository.activate({ context: data.context(REAUTHENTICATION_OPERATION.activateAdmissionPolicy), operationId: randomUUID(), confirmed: true, type: "activate_admission_policy", expectedVersion: 2 });
      const connectionId = randomUUID(), requestId = randomUUID(), usedUserId = randomUUID(), unusedUserId = randomUUID();
      const scope = { userId: usedUserId, tribeId: data.tribeId, connectionId, connectionVersion: 1, securityEpoch: data.fixture.config.securityEpoch, purpose: "admission" as const, verificationEpoch: 2, channel: "email" as const, contact: { type: "email" as const, value: `${usedUserId}@example.test` } };
      const ids = { used: { challengeId: randomUUID(), proofId: randomUUID() }, unused: { challengeId: randomUUID(), proofId: randomUUID() }, diagnostic: { challengeId: randomUUID() } };
      await database.withContext(data.fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_candidate,candidate_version) values (${connectionId},${data.tribeId},${data.fixture.userId},'draft',${data.fixture.config.environment},${scope.securityEpoch},true,1)`);
        await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch) values (${connectionId},${data.tribeId},1,${data.fixture.config.environment},${scope.securityEpoch})`);
        const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now), expiresAt = new Date(now.getTime()+600_000), applyBefore = new Date(now.getTime()+900_000);
        for (const [userId, identity] of [[usedUserId, ids.used], [unusedUserId, ids.unused]] as const) {
          await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic evidence account',${`${userId}@example.test`},false,${now},${now})`);
          const deliveryId = randomUUID();
          await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) values (${deliveryId},${data.tribeId},${connectionId},1,${data.fixture.config.environment},${scope.securityEpoch},'admission',${identity.challengeId},${userId},${identity.challengeId},'email',${randomUUID()},${randomBytes(32)},'synthetic-payload','{}',1,${now},${now},${expiresAt})`);
          await transaction.execute(sql`insert into public.contact_verification_challenges(id,user_id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,purpose,verification_epoch,connection_id,connection_version,security_epoch,channel,state,is_current,created_at,expires_at,verified_at,code_mac,mac_key_id,delivery_id) values (${identity.challengeId},${userId},${data.tribeId},'email',${`${userId}@example.test`},${randomBytes(32)},'synthetic-contact','admission',2,${connectionId},1,${scope.securityEpoch},'email','verified',true,${now},${expiresAt},${now},null,'synthetic-mac',${deliveryId})`);
          await transaction.execute(sql`insert into public.academy_admission_verification_proofs(id,challenge_id,user_id,tribe_id,contact_type,normalized_contact,verification_epoch,connection_id,connection_version,security_epoch,verified_at,apply_before) values (${identity.proofId},${identity.challengeId},${userId},${data.tribeId},'email',${`${userId}@example.test`},2,${connectionId},1,${scope.securityEpoch},${now},${applyBefore})`);
        }
        await transaction.execute(sql`insert into public.academy_admission_requests(id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,original_policy_snapshot,submitted_at,expires_at) values (${requestId},${data.tribeId},${usedUserId},'common','email',${scope.contact.value},'declared','{"version":3,"verificationEpoch":2,"mode":"manual_review","contactType":"email","requiresAdditionalVerification":true,"allowCommonExceptions":false}'::jsonb,${now},${now}::timestamptz+interval '30 days')`);
        const diagnosticDeliveryId = randomUUID();
        await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,created_at,due_at,deadline_at) values (${diagnosticDeliveryId},${data.tribeId},${connectionId},1,${data.fixture.config.environment},${scope.securityEpoch},'connection_diagnostic',${ids.diagnostic.challengeId},${data.fixture.userId},${ids.diagnostic.challengeId},'email',${randomUUID()},${randomBytes(32)},'synthetic-payload','{}',1,${now},${now},${expiresAt})`);
        await transaction.execute(sql`insert into public.contact_verification_challenges(id,user_id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,purpose,connection_id,connection_version,security_epoch,channel,state,is_current,created_at,expires_at,code_mac,mac_key_id,delivery_id) values (${ids.diagnostic.challengeId},${data.fixture.userId},${data.tribeId},'email',${data.fixture.own.email},${randomBytes(32)},'synthetic-contact','connection_diagnostic',${connectionId},1,${scope.securityEpoch},'email','issued',true,${now},${expiresAt},${randomBytes(32)},'synthetic-mac',${diagnosticDeliveryId})`);
      });
      const operationId = randomUUID();
      const proofLedger = new PostgresAdmissionOperationRepository((work) => database.withContext({ userId: usedUserId, email: null }, work), async () => true, async () => data.fixture.config);
      expect(await proofLedger.run({ actorUserId: usedUserId, tribeId: data.tribeId, operationType: ADMISSION_PROOF_OPERATION, idempotencyKey: operationId, intent: { requestId, proofId: ids.used.proofId, expectedVersion: 1 } }, z.object({ outcome: z.literal("applied"), requestVersion: z.int() }), (transaction, ledgerId) => new PostgresAdmissionVerificationProofWriter(transaction, async () => true, async () => data.fixture.config).applyToPending({ scope, ledgerId, operationId, requestId, proofId: ids.used.proofId, expectedRequestVersion: 1 }))).toMatchObject({ state: "completed", result: { outcome: "applied" } });
      const before = await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select status,submitted_at,expires_at,version,proof_id from public.academy_admission_requests where id=${requestId}`)).rows);
      await data.repository.update({ context: data.context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: randomUUID(), confirmed: true, type: "update_admission_policy", expectedVersion: 3, patch: { requiresAdditionalVerification: false } });
      expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select status,submitted_at,expires_at,version,proof_id from public.academy_admission_requests where id=${requestId}`)).rows)).toEqual(before);
      expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select id,status,applied_request_id,invalidated_at is null as not_invalidated from public.academy_admission_verification_proofs where tribe_id=${data.tribeId} order by id`)).rows)).toEqual(expect.arrayContaining([{ id: ids.used.proofId, status: "applied", applied_request_id: requestId, not_invalidated: true }, { id: ids.unused.proofId, status: "invalid", applied_request_id: null, not_invalidated: false }]));
      expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select is_current,state,invalidated_at is null as not_invalidated from public.contact_verification_challenges where id=${ids.diagnostic.challengeId}`)).rows)).toEqual([{ is_current: true, state: "issued", not_invalidated: true }]);
    });
  }, 240_000);

  it("should roll back ON activation when the owner withdraws readiness after its original check", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database); await data.initialize();
      await data.repository.update({ context: data.context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: randomUUID(), confirmed: true, type: "update_admission_policy", expectedVersion: 1, patch: { requiresAdditionalVerification: true } });
      const operationId = randomUUID(); data.retirePreparedAfterRead();
      await expect(data.repository.activate({ context: data.context(REAUTHENTICATION_OPERATION.activateAdmissionPolicy), operationId, confirmed: true, type: "activate_admission_policy", expectedVersion: 2 })).rejects.toMatchObject({ code: "admission_ineligible" });
      expect(await data.reader.read(data.readContext)).toMatchObject({ controlActivated: false, policy: { version: 2, verificationEpoch: 2, activatedAt: null } });
      expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*) from public.academy_admission_audit_events where tribe_id=${data.tribeId})::int as audits,(select state from public.academy_admission_operations where tribe_id=${data.tribeId} and idempotency_key=${operationId}) as operation_state`)).rows)).toEqual([{ audits: 2, operation_state: "started" }]);
    });
  }, 240_000);

  it("should compose native policy use cases and country readiness without assuming an incomplete cutover is prepared", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database);
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: data.fixture.userId, sessionId: data.sessionId }), (_identity, work) => database.withContext(data.fixture.own, work));
      const policy = buildAcademyAdmissionsModule({ accounts, execute: (_account, work) => database.withContext(data.fixture.own, work), clock: () => new Date() }).createPolicyModule({ readSecurityConfig: async () => data.fixture.config, composePreflight: () => ({ isPrepared: async () => false }) }).useCases;
      const query = { tribeId: data.tribeId, requestId: randomUUID() };
      expect(await policy.read(query)).toEqual({ ok: true, value: { policy: null, controlActivated: false, usage: null } });
      expect(await policy.initialize({ ...query, operationId: randomUUID(), confirmed: true })).toMatchObject({ ok: true, value: { state: "completed", result: { version: 1, activatedAt: null } } });
      expect(await policy.activate({ ...query, operationId: randomUUID(), confirmed: true, expectedVersion: 1 })).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      expect(await policy.read(query)).toMatchObject({ ok: true, value: { controlActivated: false, policy: { isOpen: false, activatedAt: null, version: 1 } } });
    });
  }, 240_000);

  it("should retain true absence, closed defaults, original replay, draft ON and exact CAS without activating or sending", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database);
      expect(await data.reader.read(data.readContext)).toEqual({ policy: null, controlActivated: false, usage: null });
      const operationId = randomUUID();
      data.loseNextReply();
      expect(await data.initialize(operationId)).toMatchObject({ state: "completed", replayed: true, result: { version: 1, verificationEpoch: 1, activatedAt: null, controlActivated: false, changed: true } });
      const initial = await data.reader.read(data.readContext);
      expect(initial.policy).toMatchObject({ mode: "manual_review", contactType: "email", isOpen: false, allowCommonExceptions: false, requiresAdditionalVerification: false });
      const edit = { context: data.context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: randomUUID(), confirmed: true as const, type: "update_admission_policy" as const, expectedVersion: 1, patch: { requiresAdditionalVerification: true } };
      expect(await data.repository.update(edit)).toMatchObject({ state: "completed", result: { version: 2, verificationEpoch: 2, activatedAt: null, controlActivated: false } });
      expect(await data.repository.update(edit)).toMatchObject({ state: "completed", replayed: true, result: { version: 2 } });
      await expect(data.repository.update({ ...edit, operationId: randomUUID() })).rejects.toMatchObject({ code: "policy_conflict" });
      await expect(data.repository.update({ ...edit, patch: { isOpen: true } })).rejects.toMatchObject({ code: "idempotency_conflict" });
      expect(data.preparationCount()).toBe(0);
      expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*) from public.tribe_members where tribe_id=${data.tribeId} and role='tribemate')::int as members,(select count(*) from public.message_deliveries where tribe_id=${data.tribeId})::int as deliveries,(select count(*) from public.academy_admission_audit_events where tribe_id=${data.tribeId})::int as audits`)).rows)).toEqual([{ members: 0, deliveries: 0, audits: 2 }]);
    });
  }, 240_000);

  it("should activate policy and marker at one instant, preserve contact and close during preparation outage", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database); await data.initialize();
      const activate = { context: data.context(REAUTHENTICATION_OPERATION.activateAdmissionPolicy), operationId: randomUUID(), confirmed: true as const, type: "activate_admission_policy" as const, expectedVersion: 1 };
      data.setPreflight(false);
      await expect(data.repository.activate(activate)).rejects.toMatchObject({ code: "admission_ineligible" });
      expect(await data.reader.read(data.readContext)).toMatchObject({ controlActivated: false, policy: { version: 1, activatedAt: null } });
      data.setPreflight(true);
      expect(await data.repository.activate({ ...activate, operationId: randomUUID() })).toMatchObject({ state: "completed", result: { version: 2, verificationEpoch: 1, controlActivated: true } });
      expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select policy.activated_at=tribe.admissions_control_activated_at as same_instant,policy.is_open from public.academy_admission_policies policy join public.tribes tribe on tribe.id=policy.tribe_id where tribe.id=${data.tribeId}`)).rows)).toEqual([{ same_instant: true, is_open: false }]);
      const update = { context: data.context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: randomUUID(), confirmed: true as const, type: "update_admission_policy" as const, expectedVersion: 2, patch: { contactType: "phone" as const } };
      await expect(data.repository.update(update)).rejects.toMatchObject({ code: "admission_ineligible" });
      await data.repository.update({ ...update, operationId: randomUUID(), patch: { isOpen: true } });
      const beforePause = data.preparationCount(); data.setPreparationFailure(true);
      expect(await data.repository.pause({ context: data.context(REAUTHENTICATION_OPERATION.pauseAdmissionPolicy), operationId: randomUUID(), confirmed: true, type: "pause_admission_policy", expectedVersion: 3, reason: "Pausa autorizada" })).toMatchObject({ state: "completed", result: { version: 4, verificationEpoch: 1, controlActivated: true } });
      expect(data.preparationCount()).toBe(beforePause);
      expect(await data.reader.read(data.readContext)).toMatchObject({ controlActivated: true, policy: { contactType: "email", isOpen: false, version: 4 } });
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`delete from public.academy_admission_policies where tribe_id=${data.tribeId}`));
      expect(await data.reader.read(data.readContext)).toEqual({ policy: null, controlActivated: true, usage: null });
      await expect(data.initialize()).rejects.toMatchObject({ code: "admission_ineligible" });
    });
  }, 240_000);

  it("should reject wrong operation scope, expired session and revoked leadership even for a confirmed original replay", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database), operationId = randomUUID(); await data.initialize(operationId);
      await expect(data.repository.activate({ context: data.context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: randomUUID(), confirmed: true, type: "activate_admission_policy", expectedVersion: 1 })).rejects.toMatchObject({ code: "permission_denied" });
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${data.tribeId} and user_id=${data.fixture.userId}`));
      await expect(data.initialize(operationId)).rejects.toMatchObject({ code: "permission_denied" });
      await expect(data.reader.read(data.readContext)).rejects.toMatchObject({ code: "permission_denied" });
      await database.withContext(data.fixture.own, async (transaction) => {
        await transaction.execute(sql`update public.tribe_members set role='leader' where tribe_id=${data.tribeId} and user_id=${data.fixture.userId}`);
        await transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${data.sessionId}`);
      });
      await expect(data.initialize(operationId)).rejects.toMatchObject({ code: "authentication_required" });
    });
  }, 240_000);
});

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native policy command HTTP", () => {
  it("should initialize, save and pause a draft with original recovery while complete runtime activation remains closed", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database), slug = `policy-${data.tribeId}`;
      for (const migration of ["20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261006180000_guard_subscription_membership_sources.sql", "20261007020000_resolve_paid_admission_requests.sql", "20261007023000_close_unavailable_admission_requests.sql"]) await database.applyMigration(migration);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const cookie = `better-auth.session_token=${encodeURIComponent(`${data.sessionToken}.${await makeSignature(data.sessionToken, secret)}`)}`, base = `${origin}/api/tribes/${slug}/admissions`;
        const request = (method: string, path: string, body?: object) => fetch(`${base}${path}`, { method, headers: { cookie, origin, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
        const absent = await request("GET", "/policy");
        expect(absent.status).toBe(200);
        expect(await absent.json()).toMatchObject({ state: "not_configured", policy: null });
        const initOperationId = randomUUID(), initialize = { operationId: initOperationId, confirmed: true };
        expect((await request("POST", "/policy", { ...initialize, expectedVersion: 1 })).status).toBe(400);
        const created = await request("POST", "/policy", initialize);
        expect(created.status).toBe(200);
        expect(await created.json()).toMatchObject({ state: "completed", operationId: initOperationId, result: { version: 1, verificationEpoch: 1, controlActivated: false } });
        expect(await (await request("POST", "/policy", initialize)).json()).toMatchObject({ state: "completed", replayed: true, result: { version: 1 } });
        const patch = { mode: "manual_review", contactType: "email", isOpen: true, allowCommonExceptions: false, requiresAdditionalVerification: true, phoneChannel: null, allowSmsAlternative: false, messagingConnectionId: null, messagingConnectionVersion: null };
        const edit = { operationId: randomUUID(), confirmed: true, expectedVersion: 1, ...patch };
        expect((await request("PUT", "/policy", { ...edit, allowedCountries: ["AR"] })).status).toBe(400);
        const saved = await request("PUT", "/policy", edit);
        expect(saved.status).toBe(200);
        expect(await saved.json()).toMatchObject({ state: "completed", result: { version: 2, verificationEpoch: 2, changed: true, controlActivated: false } });
        const preflight = await request("GET", "/policy/preflight");
        expect(preflight.status).toBe(200);
        expect(await preflight.json()).toEqual({ prepared: false, reasons: ["preflight_runtime_unavailable"], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 } });
        expect((await request("PUT", "/policy", { ...edit, operationId: randomUUID() })).status).toBe(409);
        const activation = await request("POST", "/policy/activate", { operationId: randomUUID(), confirmed: true, expectedVersion: 2 });
        expect(activation.status).toBe(409);
        expect(await activation.json()).toMatchObject({ code: "admission_ineligible" });
        const pause = await request("POST", "/policy/pause", { operationId: randomUUID(), confirmed: true, expectedVersion: 2, reason: "Pausa de borrador sintético" });
        expect(pause.status).toBe(200);
        expect(await pause.json()).toMatchObject({ state: "completed", result: { version: 3, verificationEpoch: 2, controlActivated: false } });
        const historical = await request("GET", `/operations/${initOperationId}`);
        expect(historical.status).toBe(200);
        expect(await historical.json()).toMatchObject({ type: "initialize_admission_policy", state: "completed", replayed: true, result: { version: 1 } });
        expect(await (await request("GET", "/policy")).json()).toMatchObject({ state: "draft", controlActivated: false, policy: { version: 3, isOpen: false } });
        await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where user_id=${data.fixture.userId} and tribe_id=${data.tribeId} and operation=${REAUTHENTICATION_OPERATION.updateAdmissionPolicy}`));
        const missingRecencyId = randomUUID();
        expect((await request("POST", "/policy", { operationId: missingRecencyId, confirmed: true, hasRecentAuthentication: true })).status).toBe(400);
        expect((await request("POST", "/policy", { operationId: missingRecencyId, confirmed: true })).status).toBe(401);
        expect((await request("GET", "/policy")).status).toBe(200);
        expect((await request("GET", `/operations/${initOperationId}`)).status).toBe(200);
        expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as registered from public.academy_admission_operations where tribe_id=${data.tribeId} and idempotency_key=${missingRecencyId}`)).rows)).toEqual([{ registered: 0 }]);
        await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${data.tribeId} and user_id=${data.fixture.userId}`));
        expect((await request("GET", "/policy")).status).toBe(403);
        expect((await request("GET", "/policy/preflight")).status).toBe(403);
        expect((await request("POST", "/policy", { operationId: randomUUID(), confirmed: true })).status).toBe(403);
      }));
      expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select admissions_control_activated_at is null as not_activated,(select count(*)::int from public.message_deliveries where tribe_id=${data.tribeId}) as deliveries,(select count(*)::int from public.tribe_members where tribe_id=${data.tribeId} and role='tribemate') as members from public.tribes where id=${data.tribeId}`)).rows)).toEqual([{ not_activated: true, deliveries: 0, members: 0 }]);
    });
  }, 600_000);
});

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native policy settings browser", () => {
  for (const [engine, browserType] of [["chromium", chromium], ["webkit", webkit]] as const) {
    it(`should retain conflict drafts and use real guarded policy settings in ${engine} mobile/desktop`, async () => {
      await withAcademyAdmissionDatabase(async (database) => {
        const data = await preparePolicy(database), slug = `policy-${data.tribeId}`;
        for (const migration of ["20261007001000_read_public_admission_overview.sql", "20261007002000_read_own_admission_operations.sql", "20261006180000_guard_subscription_membership_sources.sql", "20261007020000_resolve_paid_admission_requests.sql", "20261007023000_close_unavailable_admission_requests.sql"]) await database.applyMigration(migration);
        await data.initialize();
        await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
          const browser = await browserType.launch({ headless: true });
          try {
            for (const width of [1280, 390]) {
              const context = await browser.newContext({ viewport: { width, height: 900 } });
              let stage = "open_settings";
              try {
                await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${data.sessionToken}.${await makeSignature(data.sessionToken, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
                const page = await context.newPage(), runtimeErrors: string[] = [];
                page.on("pageerror", () => runtimeErrors.push("page_error"));
                page.on("console", (message) => { if (message.type() === "error" && /hydration|did not match/i.test(message.text())) runtimeErrors.push("hydration_error"); });
                await page.goto(`${origin}/${slug}/academia/admissions/settings`, { waitUntil: "commit" });
                const confirmation = page.getByRole("checkbox", { name: /Revisé las reglas/ });
                await confirmation.waitFor({ timeout: 90_000 });
                await confirmation.check({ timeout: 90_000 });
                expect(await page.getByRole("button", { name: "Activar control de admisión" }).isDisabled()).toBe(true);
                const verification = page.getByRole("checkbox", { name: "Comprobar el contacto con un código" });
                await verification.setChecked(!(await verification.isChecked()));
                expect(await confirmation.isChecked()).toBe(false);
                expect(await page.getByRole("button", { name: "Guardar borrador" }).isDisabled()).toBe(true);
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
                await page.screenshot({ path: join(process.cwd(), "user-guides/assets/academy-admissions", `${engine}-${width}-policy-settings.png`), fullPage: true });
                if (width === 1280) await captureAdmissionReview(page, "admission-policy-settings", [data.fixture.userId, data.sessionId, data.sessionToken, secret], "policy-captures.json", { selector: "form" });
                stage = "create_concurrent_conflict";
                await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set allow_common_exceptions=not allow_common_exceptions,version=version+1 where tribe_id=${data.tribeId}`));
                await confirmation.check();
                const save = page.waitForResponse((response) => response.url().endsWith(`/api/tribes/${slug}/admissions/policy`) && response.request().method() === "PUT");
                await page.getByRole("button", { name: "Guardar borrador" }).click();
                expect((await save).status()).toBe(409);
                await page.getByText("La configuración cambió. Revisala y volvé a confirmar.", { exact: true }).waitFor({ timeout: 90_000 });
                const retainedVerification = await verification.isChecked();
                if (width === 1280) await captureAdmissionReview(page, "admission-policy-conflict", [data.fixture.userId, data.sessionId, data.sessionToken, secret], "policy-captures.json", { selector: "form" });
                stage = "reload_current_without_erasing_draft";
                await page.getByRole("button", { name: "Consultar configuración actual" }).click();
                await confirmation.check({ timeout: 90_000 });
                expect(await verification.isChecked()).toBe(retainedVerification);
                const saved = page.waitForResponse((response) => response.url().endsWith(`/api/tribes/${slug}/admissions/policy`) && response.request().method() === "PUT");
                await page.getByRole("button", { name: "Guardar borrador" }).click();
                expect((await saved).status()).toBe(200);
                await page.getByText("La configuración quedó guardada.", { exact: true }).waitFor({ timeout: 90_000 });
                expect(await confirmation.isChecked()).toBe(false);
                stage = "read_actual_preflight";
                await page.getByRole("button", { name: "Revisar requisitos de activación" }).click();
                await page.getByText("La admisión completa todavía no está disponible. Podés preparar un borrador.", { exact: true }).waitFor({ timeout: 90_000 });
                expect(await page.getByRole("button", { name: "Activar control de admisión" }).isDisabled()).toBe(true);
                expect(runtimeErrors).toEqual([]);
                if (width === 1280) await captureAdmissionReview(page, "admission-policy-saved", [data.fixture.userId, data.sessionId, data.sessionToken, secret], "policy-captures.json", { selector: "form" });
                process.stdout.write(JSON.stringify({ phase: "policy_browser_verified", engine, width }) + "\n");
              } catch {
                process.stdout.write(JSON.stringify({ phase: "policy_browser_failure", engine, width, stage }) + "\n");
                throw new Error("Native policy settings failed; inspect the safe stage diagnostic");
              } finally { await context.close(); }
            }
          } finally { await browser.close(); }
        }));
        expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select admissions_control_activated_at is null as not_activated,(select count(*)::int from public.message_deliveries where tribe_id=${data.tribeId}) as deliveries,(select count(*)::int from public.tribe_members where tribe_id=${data.tribeId} and role='tribemate') as members from public.tribes where id=${data.tribeId}`)).rows)).toEqual([{ not_activated: true, deliveries: 0, members: 0 }]);
      });
    }, 600_000);
  }
});
