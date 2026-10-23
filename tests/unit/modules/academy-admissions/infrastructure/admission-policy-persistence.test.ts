/** @vitest-environment node */
/** Exercises native SQL policy commands, original ledger and actual runtime cutover alongside preparation-port cases. @module admission-policy-persistence-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
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
import { chromium, webkit, type Page } from "@playwright/test";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { PostgresAdmissionRequestRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-request-repository";
import { PostgresOwnAdmissionRequestReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-own-admission-request-reader";
import { createAcademyApprovedMembershipWriter } from "@/src/modules/tribes/infrastructure/repositories/apply-approved-academy-membership";
import { lockAcademyAdmissionMembershipScope } from "@/src/modules/tribes/infrastructure/repositories/lock-academy-admission-membership-scope";
import { createPostgresAdmissionNotificationObligationWriter } from "@/src/modules/notifications/infrastructure/repositories/admission-notification-obligation-writer";
import { join } from "node:path";
import { MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/membership-lifecycle-validation";
import { expectAdmissionProofInvalidationAudits } from "@/tests/support/admission-proof-invalidation-audit-assertions";
import { PostgresAdmissionActivityReader } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-activity-reader";
import { ADMISSION_WHATSAPP_SQL_TIMEOUT_MS } from "@/tests/support/constants/admission-whatsapp-number";
import { COMMERCIAL_MEMBERSHIP_DECISION_COPY, COMMERCIAL_MEMBERSHIP_REVIEW_COPY, COMMERCIAL_MEMBERSHIP_REVIEW_LABEL, commercialMembershipReviewDoneMessage } from "@/src/modules/academy-admissions/constants/commercial-membership-review";
import { ADMISSION_POLICY_ACTIVATION_REQUIREMENT_COPY, ADMISSION_POLICY_BROWSER_COPY, ADMISSION_POLICY_DESTINATION_COPY, ADMISSION_POLICY_DRAFT_COPY, ADMISSION_POLICY_PLATFORM_COPY } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { ADMISSION_SETUP_GUIDE_COPY, ADMISSION_SETUP_STEP_COPY } from "@/src/modules/academy-admissions/constants/admission-setup-guide";
import { createTenantRowsPreflight } from "@/tests/support/admission-tenant-rows-preflight";

/** @param database - This run's owned branch with native pg/Drizzle. @param securityConfig - Hosting configuration a native server shares with the seed; in-process suites keep independent generated keys. @returns Current leader session, policy repository and preparation-port controls. */
async function preparePolicy(database: AcademyAdmissionTestDatabase, securityConfig?: MessagingSecurityConfig) {
  const fixture = await prepareContactVerificationDatabase(database, securityConfig);
  const tribeId = randomUUID(), accountId = randomUUID(), sessionId = randomUUID(), subject = randomUUID(), sessionToken = randomUUID();
  await database.withContext(fixture.own, async (transaction) => {
    const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic policy tribe',${`policy-${tribeId}`},${fixture.userId})`);
    await transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${tribeId},'academy',true)`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.userId},'leader','active')`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},'google',${subject},${now},${now})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${sessionToken},${new Date(now.getTime()+3_600_000)},${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
  });
  /** Better Auth deletes an expired session the first time it reads it, so a later sign-in is a new session bound to the same Google identity. @returns The new session id and raw token. */
  const signInAgain = async () => {
    const renewed = { sessionId: randomUUID(), sessionToken: randomUUID() };
    await database.withContext(fixture.own, async (transaction) => {
      const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
      await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${renewed.sessionId},${fixture.userId},${renewed.sessionToken},${new Date(now.getTime()+3_600_000)},${now},${now})`);
      await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${renewed.sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
    });
    return renewed;
  };
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
  return { fixture, tribeId, sessionId, sessionToken, signInAgain, repository, reader, context, readContext, initialize, preparationCount: () => preparationCalls, setPreflight: (value: boolean) => { preflightComplete = value; }, setPreparationFailure: (value: boolean) => { failPreparation = value; }, loseNextReply: () => { loseReply = true; }, setPrepared: (value: boolean) => { channelPrepared = value; }, retirePreparedAfterRead: () => { channelPrepared = true; retireReadinessAfterRead = true; } };
}

describe.skipIf(process.env.ACADEMY_ADMISSION_SQL_TESTS !== "1")("native admission policy persistence", () => {
  it("should preserve the declared WhatsApp requirement across old clients and messaging outages", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database);
      await data.initialize();
      const command = { context: data.context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: randomUUID(), type: "update_admission_policy" as const, confirmed: true as const, expectedVersion: 1, patch: { requiresWhatsappNumber: true } };
      expect(await data.repository.update(command)).toMatchObject({ state: "completed", result: { version: 2, verificationEpoch: 1, changed: true } });
      expect((await data.reader.read(data.readContext)).policy).toMatchObject({ requiresWhatsappNumber: true, version: 2, verificationEpoch: 1 });
      expect(await data.repository.update({ ...command, operationId: randomUUID(), expectedVersion: 2, patch: { isOpen: true } })).toMatchObject({ state: "completed", result: { version: 3, changed: true } });
      expect((await data.reader.read(data.readContext)).policy).toMatchObject({ requiresWhatsappNumber: true, isOpen: true, version: 3 });
      expect(await data.repository.update({ ...command, operationId: randomUUID(), expectedVersion: 3 })).toMatchObject({ state: "completed", result: { version: 3, changed: false } });
      await expect(data.repository.update({ ...command, operationId: randomUUID(), expectedVersion: 2 })).rejects.toMatchObject({ code: "policy_conflict" });
      data.setPrepared(true);
      expect(await data.repository.update({ ...command, operationId: randomUUID(), expectedVersion: 3, patch: { requiresAdditionalVerification: true } })).toMatchObject({ state: "completed", result: { version: 4, verificationEpoch: 2 } });
      expect(await data.repository.activate({ context: data.context(REAUTHENTICATION_OPERATION.activateAdmissionPolicy), operationId: randomUUID(), type: "activate_admission_policy", confirmed: true, expectedVersion: 4 })).toMatchObject({ state: "completed", result: { version: 5, controlActivated: true } });
      const preparedReads = data.preparationCount();
      data.setPrepared(false); data.setPreparationFailure(true);
      expect(await data.repository.update({ ...command, operationId: randomUUID(), expectedVersion: 5, patch: { requiresWhatsappNumber: false } })).toMatchObject({ state: "completed", result: { version: 6, verificationEpoch: 2, changed: true } });
      expect(data.preparationCount()).toBe(preparedReads);
      expect((await data.reader.read(data.readContext)).policy).toMatchObject({ requiresWhatsappNumber: false, requiresAdditionalVerification: true, version: 6, verificationEpoch: 2 });
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${data.tribeId} and user_id=${data.fixture.userId}`));
      await expect(data.repository.update({ ...command, operationId: randomUUID(), expectedVersion: 6 })).rejects.toMatchObject({ code: "permission_denied" });
      expect(await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute(sql`select requires_whatsapp_number,version,verification_epoch,(select count(*)::int from public.message_deliveries where tribe_id=${data.tribeId}) as deliveries from public.academy_admission_policies where tribe_id=${data.tribeId}`)).rows)).toEqual([{ requires_whatsapp_number: false, version: 6, verification_epoch: 2, deliveries: 0 }]);
    });
  }, ADMISSION_WHATSAPP_SQL_TIMEOUT_MS);

  it("should preserve the original actor and policy audit once when a committed reply is lost or replayed", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange: native current leadership, live session and the real policy/operation owners.
      const data = await preparePolicy(database), initializeId = randomUUID();
      await data.initialize(initializeId);
      const intent = { context: data.context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: randomUUID(), type: "update_admission_policy" as const, confirmed: true as const, expectedVersion: 1, patch: { isOpen: true } };
      // Act: lose only the confirmed commit reply, then recover/replay that original.
      data.loseNextReply();
      expect(await data.repository.update(intent)).toMatchObject({ state: "completed", result: { version: 2, changed: true } });
      expect(await data.repository.update(intent)).toMatchObject({ state: "completed", replayed: true, result: { version: 2 } });
      const configured = { mode: "manual_review", contactType: "email", isOpen: false, allowCommonExceptions: false, requiresAdditionalVerification: false, requiresWhatsappNumber: false, phoneChannel: null, allowSmsAlternative: false, messagingConnectionId: null, messagingConnectionVersion: null, verificationEpoch: 1, activatedAt: null };
      // Assert: audit and ledger preserve one actual effect and the correct scope.
      const audit = await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select event.actor_user_id,event.resource_type,event.resource_id,event.event_type,event.resource_version,event.rule,event.cause,event.metadata,operation.idempotency_key,event.created_at>=operation.created_at as ordered from public.academy_admission_audit_events event join public.academy_admission_operations operation on operation.id=event.operation_id and operation.tribe_id=event.tribe_id where event.tribe_id=${data.tribeId} order by event.resource_version`)).rows);
      expect(audit).toEqual([
        { actor_user_id: data.fixture.userId, resource_type: "admission_policy", resource_id: data.tribeId, event_type: "initialize_admission_policy", resource_version: 1, rule: null, cause: null, metadata: { previousVersion: null, fromPolicy: null, toPolicy: configured }, idempotency_key: initializeId, ordered: true },
        { actor_user_id: data.fixture.userId, resource_type: "admission_policy", resource_id: data.tribeId, event_type: "update_admission_policy", resource_version: 2, rule: null, cause: null, metadata: { previousVersion: 1, fromPolicy: configured, toPolicy: { ...configured, isOpen: true } }, idempotency_key: intent.operationId, ordered: true },
      ]);
      await expect(data.repository.update({ ...intent, operationId: randomUUID(), expectedVersion: 1 })).rejects.toMatchObject({ code: "policy_conflict" });
      expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as count from public.academy_admission_audit_events where tribe_id=${data.tribeId}`)).rows)).toEqual([{ count: 2 }]);
      const activation = await data.repository.activate({ context: data.context(REAUTHENTICATION_OPERATION.activateAdmissionPolicy), operationId: randomUUID(), type: "activate_admission_policy", confirmed: true, expectedVersion: 2 });
      if (activation.state !== "completed") throw new Error("Synthetic policy audit activation did not complete");
      const activated = { ...configured, isOpen: true, activatedAt: activation.result.activatedAt };
      await data.repository.pause({ context: data.context(REAUTHENTICATION_OPERATION.pauseAdmissionPolicy), operationId: randomUUID(), type: "pause_admission_policy", confirmed: true, expectedVersion: 3, reason: "Pausa sintética de capacidad" });
      const reader = new PostgresAdmissionActivityReader((_scope, run) => database.withContext(data.fixture.own, run));
      const scope = { tribeId: data.tribeId, userId: data.fixture.userId, sessionId: data.sessionId, requestId: randomUUID() };
      const history = await reader.readActivity(scope, { limit: 50, resourceType: "admission_policy" });
      expect(history.items.map((event) => event.changes)).toEqual([
        { previousVersion: 3, fromPolicy: activated, toPolicy: { ...activated, isOpen: false } },
        { previousVersion: 2, fromPolicy: { ...configured, isOpen: true }, toPolicy: activated },
        { previousVersion: 1, fromPolicy: configured, toPolicy: { ...configured, isOpen: true } },
        { previousVersion: null, fromPolicy: null, toPolicy: configured },
      ]);
      await reader.readMetrics(scope);
      expect(await data.repository.update(intent)).toMatchObject({ state: "completed", replayed: true, result: { version: 2 } });
      expect(await data.repository.update({ ...intent, operationId: randomUUID(), expectedVersion: 4, patch: { isOpen: false } })).toMatchObject({ state: "completed", result: { version: 4, changed: false } });
      const beforeDeletion = await database.withContext(data.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select version,event.created_at=policy.updated_at as same_clock from public.academy_admission_policies policy join public.academy_admission_audit_events event on event.tribe_id=policy.tribe_id and event.resource_type='admission_policy' and event.resource_version=policy.version where policy.tribe_id=${data.tribeId}`)).rows).toEqual([{ version: 4, same_clock: true }]);
        return (await transaction.execute<{ id: string; metadata: unknown }>(sql`select id,metadata from public.academy_admission_audit_events where tribe_id=${data.tribeId} and resource_type='admission_policy' order by resource_version`)).rows;
      });
      expect(beforeDeletion).toHaveLength(4);
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        const polluted = { previousVersion: 3, fromPolicy: activated, toPolicy: { ...activated, apiKey: "synthetic-private-key" }, apiKey: "synthetic-private-key", providerBody: { contact: "hidden@example.test" } };
        expect((await transaction.execute<{ metadata: unknown }>(sql`select public.project_retired_admission_owner_metadata('admission_policy','pause_admission_policy',${JSON.stringify(polluted)}::jsonb) as metadata`)).rows).toEqual([{ metadata: { previousVersion: 3, fromPolicy: activated, toPolicy: activated } }]);
        const { requiresWhatsappNumber: _omittedRequirement, ...historicalPolicy } = activated;
        expect((await transaction.execute(sql`select public.project_retired_admission_policy_snapshot(${JSON.stringify(historicalPolicy)}::jsonb) as snapshot,public.project_retired_admission_owner_cause('whatsapp_number_required') as cause,public.project_retired_admission_owner_cause('synthetic-private-cause') as unknown_cause`)).rows).toEqual([{ snapshot: historicalPolicy, cause: "whatsapp_number_required", unknown_cause: null }]);
        await transaction.execute(sql`delete from public.tribes where id=${data.tribeId}`);
        expect((await transaction.execute(sql`select id,metadata from public.academy_admission_retired_audit_events where tribe_id=${data.tribeId} and resource_type='admission_policy' order by resource_version`)).rows).toEqual(beforeDeletion);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should use the current evaluator for safe preflight and close disabled recovery and decision-trigger gaps without repairing history", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database); await data.initialize();
      for (const migration of ["20261006180000_guard_subscription_membership_sources.sql", "20261007020000_resolve_paid_admission_requests.sql", "20261007023000_close_unavailable_admission_requests.sql"]) await database.applyMigration(migration);
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: data.fixture.userId, sessionId: data.sessionId }), (_identity, work) => database.withContext(data.fixture.own, work));
      const admissionModule = buildAcademyAdmissionsModule({ accounts, execute: (_account, work) => database.withContext(data.fixture.own, work), clock: () => new Date() });
      const runtime = admissionModule.createManualRequestModule({ readSecurityConfig: async () => data.fixture.config }).runtime;
      let recoveryLocked = false;
      const preflight = admissionModule.createPreflightModule({ runtime, readRecoveryLock: async () => recoveryLocked }).useCases;
      const query = { tribeId: data.tribeId, requestId: randomUUID() };
      expect(await preflight.execute(query)).toEqual({ ok: true, value: { prepared: true, reasons: [], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 } } });
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_academy_settings set admission_enabled=false where tribe_id=${data.tribeId}`));
      expect(await preflight.execute(query)).toEqual({ ok: true, value: { prepared: false, reasons: ["preflight_evaluator_disabled"], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 } } });
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_academy_settings set admission_enabled=true where tribe_id=${data.tribeId}`));
      recoveryLocked = true;
      expect(await preflight.execute(query)).toEqual({ ok: true, value: { prepared: false, reasons: ["preflight_recovery_locked"], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 } } });
      recoveryLocked = false;
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`alter table public.academy_admission_decisions disable trigger admission_decision_commit_guard`));
      expect(await preflight.execute(query)).toEqual({ ok: true, value: { prepared: false, reasons: ["preflight_storage_unavailable"], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 } } });
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`alter table public.academy_admission_decisions enable trigger admission_decision_commit_guard`));
      expect(await preflight.execute(query)).toMatchObject({ ok: true, value: { prepared: true } });
      await database.withContext(data.fixture.own, async (transaction) => {
        const unknown = randomUUID(), privileged = randomUUID();
        for (const userId of [unknown, privileged]) await transaction.execute(sql`insert into public."user"(id,name,email,"createdAt","updatedAt") values (${userId},'Synthetic unresolved member',${`${userId}@example.test`},clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status,status_reason,commercial_recovery_status) values (${data.tribeId},${unknown},'tribemate','removed','subscription_inactive',null),(${data.tribeId},${privileged},'guardian','removed','payment_blocked','muted')`);
      });
      const before = await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`select id,role,status,created_at,commercial_recovery_status from public.tribe_members where tribe_id=${data.tribeId} order by id`));
      expect(await preflight.execute(query)).toEqual({ ok: true, value: { prepared: false, reasons: ["preflight_unknown_commercial_history", "preflight_privileged_commercial_membership"], impact: { unknownCommercialMemberCount: 1, privilegedCommercialMemberCount: 1 } } });
      const after = await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`select id,role,status,created_at,commercial_recovery_status from public.tribe_members where tribe_id=${data.tribeId} order by id`));
      expect(after.rows).toEqual(before.rows);
      expect(await data.reader.read(data.readContext)).toMatchObject({ controlActivated: false, policy: { activatedAt: null, version: 1 } });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should activate policy and marker together through the current module composition without creating memberships or challenges", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database); await data.initialize();
      for (const migration of ["20261006180000_guard_subscription_membership_sources.sql", "20261007020000_resolve_paid_admission_requests.sql", "20261007023000_close_unavailable_admission_requests.sql"]) await database.applyMigration(migration);
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: data.fixture.userId, sessionId: data.sessionId }), (_identity, work) => database.withContext(data.fixture.own, work));
      const admissionModule = buildAcademyAdmissionsModule({ accounts, execute: (_account, work) => database.withContext(data.fixture.own, work), clock: () => new Date() });
      const runtime = admissionModule.createManualRequestModule({ readSecurityConfig: async () => data.fixture.config }).runtime;
      const policy = admissionModule.createPolicyModule({ readSecurityConfig: async () => data.fixture.config, composePreflight: (transaction, context) => new PostgresAdmissionActivationRepository(transaction, context, runtime, async () => false) }).useCases;
      const input = { tribeId: data.tribeId, requestId: randomUUID(), operationId: randomUUID(), expectedVersion: 1, confirmed: true as const };
      expect(await admissionModule.createPreflightModule({ runtime, readRecoveryLock: async () => false }).useCases.execute({ tribeId: data.tribeId, requestId: randomUUID() })).toMatchObject({ ok: true, value: { prepared: true } });
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_academy_settings set admission_enabled=false where tribe_id=${data.tribeId}`));
      expect(await policy.activate({ ...input, operationId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "admission_ineligible" } });
      expect(await data.reader.read(data.readContext)).toMatchObject({ controlActivated: false, policy: { activatedAt: null, version: 1 } });
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_academy_settings set admission_enabled=true where tribe_id=${data.tribeId}`));
      expect(await policy.activate(input)).toMatchObject({ ok: true, value: { state: "completed", replayed: false, result: { controlActivated: true, changed: true, version: 2 } } });
      expect(await policy.activate(input)).toMatchObject({ ok: true, value: { state: "completed", replayed: true } });
      await database.withContext(data.fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select policy.activated_at=tribe.admissions_control_activated_at as same_instant,policy.version from public.academy_admission_policies policy join public.tribes tribe on tribe.id=policy.tribe_id where tribe.id=${data.tribeId}`)).rows).toEqual([{ same_instant: true, version: 2 }]);
        expect((await transaction.execute(sql`select (select count(*)::integer from public.tribe_members where tribe_id=${data.tribeId}) as members,(select count(*)::integer from public.academy_admission_requests where tribe_id=${data.tribeId}) as requests,(select count(*)::integer from public.contact_verification_challenges where tribe_id=${data.tribeId}) as challenges`)).rows).toEqual([{ members: 1, requests: 0, challenges: 0 }]);
      });
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it("should keep the same pending request undecided through native verification activation and later permissive policy changes", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database);
      for (const migration of ["20261006220000_extend_admission_notifications.sql", "20261006234000_read_own_admission_summary.sql", "20261011024000_read_current_own_admission_eligibility.sql", "20261007005000_read_admission_reviews.sql", "20261007030000_capture_admission_decision_evidence.sql"]) await database.applyMigration(migration);
      await data.initialize();
      await data.repository.update({ context: data.context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: randomUUID(), type: "update_admission_policy", confirmed: true, expectedVersion: 1, patch: { isOpen: true } });
      await data.repository.activate({ context: data.context(REAUTHENTICATION_OPERATION.activateAdmissionPolicy), operationId: randomUUID(), type: "activate_admission_policy", confirmed: true, expectedVersion: 2 });
      const applicantId = randomUUID(), applicantSessionId = randomUUID();
      await database.withContext(data.fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values (${applicantId},'Synthetic policy-transition applicant',${`${applicantId}@example.test`},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${applicantSessionId},${applicantId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`);
      });
      const requests = new PostgresAdmissionRequestRepository((scope, run) => database.withContext({ userId: scope.userId, email: null }, run), async () => data.fixture.config, (transaction) => ({ memberships: createAcademyApprovedMembershipWriter(transaction), notifications: createPostgresAdmissionNotificationObligationWriter(transaction), lockSubmissionScope: (scope) => lockAcademyAdmissionMembershipScope(transaction, scope.tribeId, scope.userId) }));
      const submitted = await requests.submit({ userId: applicantId, sessionId: applicantSessionId, tribeId: data.tribeId, requestId: randomUUID(), operationId: randomUUID(), type: "submit_admission", confirmed: true, expectedPolicyVersion: 3, source: { kind: "common" }, contact: { type: "email", value: `${applicantId}@example.test` }, proofId: null, message: null });
      if (submitted.state !== "completed" || !submitted.result.admissionRequestId) throw new Error("Native policy transition did not produce the expected pending request");
      const requestId = submitted.result.admissionRequestId;
      const own = new PostgresOwnAdmissionRequestReader((scope, run) => database.withContext({ userId: scope.userId, email: null }, run));
      const query = { userId: applicantId, sessionId: applicantSessionId, tribeId: data.tribeId, requestId: randomUUID() };
      const before = await own.readOwn(query);
      expect(before).toMatchObject({ id: requestId, status: "pending", version: 1, needsVerification: false });
      data.setPrepared(true);
      expect(await data.repository.update({ context: data.context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: randomUUID(), type: "update_admission_policy", confirmed: true, expectedVersion: 3, patch: { requiresAdditionalVerification: true } })).toMatchObject({ state: "completed", result: { version: 4, verificationEpoch: 2 } });
      expect(await own.readOwn(query)).toMatchObject({ id: requestId, status: "pending", version: 1, needsVerification: true, eligibilityReasons: ["local_proof_required"], submittedAt: before!.submittedAt, expiresAt: before!.expiresAt });
      await expect(requests.decide({ userId: data.fixture.userId, sessionId: data.sessionId, tribeId: data.tribeId, requestId: randomUUID(), operationId: randomUUID(), type: "decide_admission_request", confirmed: true, admissionRequestId: requestId, expectedVersion: 1, decision: "approve", internalReason: "Revisión sintética sin nueva prueba", externalMessage: null })).rejects.toMatchObject({ code: "admission_ineligible" });
      expect(await data.repository.update({ context: data.context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: randomUUID(), type: "update_admission_policy", confirmed: true, expectedVersion: 4, patch: { requiresAdditionalVerification: false, allowCommonExceptions: true } })).toMatchObject({ state: "completed", result: { version: 5, verificationEpoch: 2 } });
      expect(await own.readOwn(query)).toMatchObject({ id: requestId, status: "pending", version: 1, needsVerification: false, submittedAt: before!.submittedAt, expiresAt: before!.expiresAt });
      await database.withContext(data.fixture.own, async (transaction) => {
        const effects = (await transaction.execute(sql`select (select count(*)::int from public.academy_admission_requests where tribe_id=${data.tribeId} and user_id=${applicantId}) as requests,(select count(*)::int from public.academy_admission_decisions where request_id=${requestId}) as decisions,(select count(*)::int from public.tribe_members where tribe_id=${data.tribeId} and user_id=${applicantId}) as memberships,(select count(*)::int from public.academy_admission_notification_obligations where request_id=${requestId}) as notices`)).rows[0];
        expect(effects).toEqual({ requests: 1, decisions: 0, memberships: 0, notices: 1 });
      });
    });
  }, 1_200_000);

  it("should inspect actual guarded cutover storage and keep incomplete runtime or disabled provenance closed", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database); await data.initialize();
      let runtimePrepared = false;
      const inventory = () => database.withContext(data.fixture.own, (transaction) => new PostgresAdmissionActivationRepository(transaction, data.readContext, { isPrepared: async () => runtimePrepared }, async () => false).read(data.readContext));
      expect(await inventory()).toMatchObject({ tribeId: data.tribeId, isAcademy: true, policyPresent: true, markerConsistent: true, storagePrepared: false, ingressProtected: false, runtimePrepared: false });
      for (const migration of ["20261006180000_guard_subscription_membership_sources.sql", "20261007020000_resolve_paid_admission_requests.sql", "20261007023000_close_unavailable_admission_requests.sql"]) await database.applyMigration(migration);
      const current = await inventory();
      expect(current).toMatchObject({ storagePrepared: true, ingressProtected: true, runtimePrepared: false, unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 });
      const prepared = () => database.withContext(data.fixture.own, (transaction) => new PostgresAdmissionActivationRepository(transaction, data.readContext, { isPrepared: async () => runtimePrepared }, async () => false).readPreparation(data.tribeId).then((preparation) => preparation.prepared));
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
      const preview = buildAcademyAdmissionsModule({ accounts, execute: (_account, work) => database.withContext(data.fixture.own, work), clock: () => new Date() }).createPreflightModule({ runtime: { isPrepared: async () => false }, readRecoveryLock: async () => false }).useCases;
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
        const repository = new PostgresAdmissionActivationRepository(transaction, data.readContext, { isPrepared: async () => true }, async () => false);
        const inventory = await repository.read(data.readContext);
        expect(await repository.readPreparation(data.tribeId)).toMatchObject({ prepared: false });
        await expect(repository.readPreparation(randomUUID())).rejects.toMatchObject({ code: "permission_denied" });
        return inventory;
      });
      expect(observed).toMatchObject({ unknownCommercialMemberCount: 1, privilegedCommercialMemberCount: 1 });
      expect(observed).toMatchObject({ storagePrepared: true, ingressProtected: true, runtimePrepared: true });
      expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select user_id,role,status,status_reason,commercial_recovery_status from public.tribe_members where tribe_id=${data.tribeId} and user_id in (${unknownId},${privilegedId}) order by user_id`)).rows)).toEqual(before);
      expect(observed).not.toHaveProperty("members");
      await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${data.tribeId} and user_id=${data.fixture.userId}`));
      await expect(database.withContext(data.fixture.own, (transaction) => new PostgresAdmissionActivationRepository(transaction, data.readContext, { isPrepared: async () => true }, async () => false).read(data.readContext))).rejects.toMatchObject({ code: "permission_denied" });
    });
  }, 300_000);

  it("should compose current policy absence and protected loss through native query owners without secret access", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database);
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: data.fixture.userId, sessionId: data.sessionId }), (_identity, work) => database.withContext(data.fixture.own, work));
      const policy = buildAcademyAdmissionsModule({ accounts, execute: (_account, work) => database.withContext(data.fixture.own, work), clock: () => new Date() }).createPolicyQueryModule({ composePreparation: null }).useCases;
      const query = { tribeId: data.tribeId, requestId: randomUUID() };
      expect(await policy.execute(query)).toMatchObject({ ok: true, value: { state: "not_configured", policy: null, controlActivated: false, preparation: { state: "not_evaluated" }, impact: { pendingRequestCount: 0 } } });
      await data.initialize();
      await data.repository.activate({ context: data.context(REAUTHENTICATION_OPERATION.activateAdmissionPolicy), operationId: randomUUID(), confirmed: true, type: "activate_admission_policy", expectedVersion: 1 });
      await database.withContext(data.fixture.own, async (transaction) => {
        await transaction.execute(sql`delete from public.academy_admission_policies where tribe_id=${data.tribeId}`);
      });
      expect(await policy.execute(query)).toMatchObject({ ok: true, value: { state: "unavailable", policy: null, controlActivated: true, preparation: { state: "not_evaluated" }, impact: { contactTypeLocked: true, historicalLinksProtected: true } } });
      expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as policies from public.academy_admission_policies where tribe_id=${data.tribeId}`)).rows)).toEqual([{ policies: 0 }]);
    });
  }, 240_000);

  it("should name an unprepared verification channel in the leader's read through the same preparation the activation enforces", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database);
      await data.initialize();
      await data.repository.update({ context: data.context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: randomUUID(), confirmed: true, type: "update_admission_policy", expectedVersion: 1, patch: { requiresAdditionalVerification: true } });
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: data.fixture.userId, sessionId: data.sessionId }), (_identity, work) => database.withContext(data.fixture.own, work));
      const admissions = buildAcademyAdmissionsModule({ accounts, execute: (_account, work) => database.withContext(data.fixture.own, work), clock: () => new Date() });
      /** Mirrors the production composition: the query reuses the commands' preparation evaluator instead of reporting it as not evaluated. */
      const commands = admissions.createPolicyModule({ readSecurityConfig: async () => data.fixture.config, composePreflight: (transaction, context) => new PostgresAdmissionActivationRepository(transaction, context, { isPrepared: async () => true }, async () => false) });
      const query = { tribeId: data.tribeId, requestId: randomUUID() };
      expect(await admissions.createPolicyQueryModule({ composePreparation: null }).useCases.execute(query)).toMatchObject({ ok: true, value: { state: "draft", preparation: { state: "not_evaluated", requirements: [] } } });
      const evaluated = await admissions.createPolicyQueryModule({ composePreparation: commands.composePreparation }).useCases.execute(query);
      expect(evaluated).toMatchObject({ ok: true, value: { state: "draft", preparation: { state: "evaluated" } } });
      expect(evaluated.ok && evaluated.value.preparation.requirements).toContain("verification_unavailable");
      expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select admissions_control_activated_at is null as not_activated from public.tribes where id=${data.tribeId}`)).rows)).toEqual([{ not_activated: true }]);
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
      const disableOperationId = randomUUID();
      const disableIntent = { context: data.context(REAUTHENTICATION_OPERATION.updateAdmissionPolicy), operationId: disableOperationId, confirmed: true as const, type: "update_admission_policy" as const, expectedVersion: 3, patch: { requiresAdditionalVerification: false } };
      const disabled = await data.repository.update(disableIntent);
      const expectedProofAudits = { tribeId: data.tribeId, actorUserId: data.fixture.userId, operationId: disableOperationId, cause: "policy_verification_context_changed", proofs: [{ proofId: ids.unused.proofId, challengeId: ids.unused.challengeId, fromState: "available" as const, requestId: null, verificationEpoch: 2, channel: "email" as const }] };
      await database.withContext(data.fixture.own, (transaction) => expectAdmissionProofInvalidationAudits(transaction, expectedProofAudits));
      expect(await data.repository.update(disableIntent)).toMatchObject({ ...disabled, replayed: true });
      await database.withContext(data.fixture.own, (transaction) => expectAdmissionProofInvalidationAudits(transaction, expectedProofAudits));
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
      const policy = buildAcademyAdmissionsModule({ accounts, execute: (_account, work) => database.withContext(data.fixture.own, work), clock: () => new Date() }).createPolicyModule({ readSecurityConfig: async () => data.fixture.config, composePreflight: (transaction) => createTenantRowsPreflight(transaction, () => false) }).useCases;
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
  it("should initialize, save and pause a draft with original recovery while an unprepared verification channel keeps activation closed", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database, await readMessagingHostingSecurityConfig()), slug = `policy-${data.tribeId}`;
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const signedCookie = async (token: string) => `better-auth.session_token=${encodeURIComponent(`${token}.${await makeSignature(token, secret)}`)}`, base = `${origin}/api/tribes/${slug}/admissions`;
        let cookie = await signedCookie(data.sessionToken);
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
        const patch = { mode: "manual_review", contactType: "email", isOpen: true, allowCommonExceptions: false, requiresAdditionalVerification: true, phoneChannel: null, allowSmsAlternative: false };
        const edit = { operationId: randomUUID(), confirmed: true, expectedVersion: 1, ...patch };
        expect((await request("PUT", "/policy", { ...edit, allowedCountries: ["AR"] })).status).toBe(400);
        const saved = await request("PUT", "/policy", edit);
        expect(saved.status).toBe(200);
        expect(await saved.json()).toMatchObject({ state: "completed", result: { version: 2, verificationEpoch: 2, changed: true, controlActivated: false } });
        const preflight = await request("GET", "/policy/preflight");
        expect(preflight.status).toBe(200);
        expect(await preflight.json()).toEqual({ prepared: true, reasons: [], impact: { unknownCommercialMemberCount: 0, privilegedCommercialMemberCount: 0 } });
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
        const expiredSessionId = randomUUID();
        expect((await request("POST", "/policy", { operationId: expiredSessionId, confirmed: true, hasRecentAuthentication: true })).status).toBe(400);
        await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${data.sessionId}`));
        expect((await request("POST", "/policy", { operationId: expiredSessionId, confirmed: true })).status).toBe(401);
        expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as sessions from public.session where id=${data.sessionId}`)).rows)).toEqual([{ sessions: 0 }]);
        cookie = await signedCookie((await data.signInAgain()).sessionToken);
        expect((await request("GET", "/policy")).status).toBe(200);
        expect((await request("GET", `/operations/${initOperationId}`)).status).toBe(200);
        expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as registered from public.academy_admission_operations where tribe_id=${data.tribeId} and idempotency_key=${expiredSessionId}`)).rows)).toEqual([{ registered: 0 }]);
        await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${data.tribeId} and user_id=${data.fixture.userId}`));
        expect((await request("GET", "/policy")).status).toBe(403);
        expect((await request("GET", "/policy/preflight")).status).toBe(403);
        expect((await request("POST", "/policy", { operationId: randomUUID(), confirmed: true })).status).toBe(403);
      }));
      expect(await database.withContext(data.fixture.own, async (transaction) => (await transaction.execute(sql`select admissions_control_activated_at is null as not_activated,(select count(*)::int from public.message_deliveries where tribe_id=${data.tribeId}) as deliveries,(select count(*)::int from public.tribe_members where tribe_id=${data.tribeId} and role='tribemate') as members from public.tribes where id=${data.tribeId}`)).rows)).toEqual([{ not_activated: true, deliveries: 0, members: 0 }]);
    });
  }, 600_000);
});

/**
 * The app shell clips horizontal overflow, so the document width cannot reveal a guided flow wider than its panel.
 * @param page - Rendered settings page.
 * @param label - Accessible name of the guided flow form.
 * @returns After the flow fits its panel once the step slide settles.
 */
async function expectGuidedFlowFits(page: Page, label: string): Promise<void> {
  await page.waitForFunction((name) => { const form = document.querySelector(`form[aria-label="${name}"]`); return form !== null && form.scrollWidth <= form.clientWidth + 1; }, label, { timeout: 10_000 });
}
describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native policy settings browser", () => {
  it.each([{ engine: "chromium", browserType: chromium }, { engine: "webkit", browserType: webkit }])("should stop the chained activation on memberships blocked by payment and clear it once each one is decided in $engine", async ({ engine, browserType }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database, await readMessagingHostingSecurityConfig()), slug = `policy-${data.tribeId}`;
      await data.initialize();
      await database.withContext(data.fixture.own, async (transaction) => {
        const unknown = randomUUID(), crossed = randomUUID(), guardian = randomUUID();
        for (const [userId, name] of [[unknown, "Integrante sintética A"], [crossed, "Integrante sintética B"], [guardian, "Guardián sintético"]]) await transaction.execute(sql`insert into public."user"(id,name,email,"createdAt","updatedAt") values (${userId},${name},${`${userId}@example.test`},clock_timestamp(),clock_timestamp())`);
        // A canonical pair (removed + subscription_inactive), a crossed pair (blocked + subscription_inactive) and a guardian: the review lists every commercial combination.
        await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status,status_reason,commercial_recovery_status) values (${data.tribeId},${unknown},'tribemate','removed','subscription_inactive',null),(${data.tribeId},${crossed},'tribemate','blocked','subscription_inactive',null),(${data.tribeId},${guardian},'guardian','blocked','payment_blocked','muted')`);
      });
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const browser = await browserType.launch({ headless: true });
        try {
          for (const width of [1280, 390]) {
            const context = await browser.newContext({ viewport: { width, height: 900 } });
            try {
              await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${data.sessionToken}.${await makeSignature(data.sessionToken, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
              const page = await context.newPage(), runtimeErrors: string[] = [];
              page.on("pageerror", () => runtimeErrors.push("page_error"));
              page.on("console", (message) => { if (message.type() === "error" && /hydration|did not match/i.test(message.text())) runtimeErrors.push("hydration_error"); });
              let activationRequests = 0;
              page.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith(`/api/tribes/${slug}/admissions/policy/activate`)) activationRequests += 1; });
              await page.goto(`${origin}/${slug}/academia/admissions/settings`, { waitUntil: "commit" });
              const next = page.getByRole("button", { name: "Continuar", exact: true });
              await next.waitFor({ timeout: 90_000 });
              /** The server-read preflight of the saved draft already names what blocks activation. */
              const impact = page.getByRole("region", { name: "Lo que falta resolver" });
              await impact.waitFor({ timeout: 90_000 });
              const desktop = width === 1280;
              expect((await impact.textContent())?.includes("Membresías bloqueadas por pago sin revisar: 2.")).toBe(desktop);
              expect(await impact.textContent()).toContain("Guardianes bloqueados por pago: 1.");
              /** The chained flow stops at the membership review: its continue action stays disabled and the final action is never offered. */
              await next.click({ timeout: 90_000 });
              while (await next.count() && await next.isEnabled()) await next.click();
              await page.getByText(COMMERCIAL_MEMBERSHIP_REVIEW_COPY.pendingBlocked, { exact: true }).first().waitFor({ timeout: 90_000 });
              expect(await next.isDisabled()).toBe(true);
              expect(await page.getByRole("button", { name: "Guardar y activar admisiones", exact: true }).count()).toBe(0);
              const rows = page.getByRole("list", { name: COMMERCIAL_MEMBERSHIP_REVIEW_COPY.listLabel, exact: true }).locator(":scope > li");
              expect(await rows.count()).toBe(desktop ? 3 : 1);
              await expectGuidedFlowFits(page, "Configurar reglas de admisión");
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
              expect(runtimeErrors).toEqual([]);
              await page.screenshot({ path: join(process.cwd(), "user-guides/assets/academy-admissions", `${engine}-${width}-policy-preflight.png`), fullPage: true });
              const forbidden = [data.fixture.userId, data.sessionId, data.sessionToken, secret];
              /** Each context writes its own export: a capture file holds only the captures of the page that wrote it. */
              const capture = (name: string, outputFile: string) => captureAdmissionReview(page, name, forbidden, outputFile, { selector: 'section[aria-label="Reglas de admisión"]' });
              if (desktop) await capture("admission-policy-preflight", "preflight-captures.json");
              /**
               * Decides one listed membership through the real audited resolution.
               * @param row - Listed membership row. @param decision - Visible decision label. @param remaining - Rows expected afterwards.
               */
              const decide = async (row: ReturnType<typeof rows.first>, decision: string, remaining: number) => {
                await row.getByRole("radio", { name: decision, exact: true }).click();
                await row.getByRole("checkbox", { name: COMMERCIAL_MEMBERSHIP_REVIEW_COPY.confirm, exact: true }).check();
                const resolution = page.waitForResponse((result) => result.request().method() === "POST" && new URL(result.url()).pathname.endsWith("/resolution"));
                await row.getByRole("button", { name: COMMERCIAL_MEMBERSHIP_REVIEW_COPY.submit, exact: true }).click();
                expect((await resolution).status()).toBe(200);
                if (remaining > 0) await page.waitForFunction(({ label, count }) => document.querySelectorAll(`ul[aria-label="${label}"] > li`).length === count, { label: COMMERCIAL_MEMBERSHIP_REVIEW_COPY.listLabel, count: remaining });
              };
              /** Desktop decides both unknown histories (the canonical and the crossed pair); mobile retires the remaining guardian. */
              if (desktop) {
                const unknownRows = rows.filter({ hasText: COMMERCIAL_MEMBERSHIP_REVIEW_LABEL.kind.unknown_history });
                await decide(unknownRows.first(), COMMERCIAL_MEMBERSHIP_DECISION_COPY.tribemate.recover_active, 2);
                await capture("admission-policy-membership-decided", "preflight-captures.json");
                await decide(rows.filter({ hasText: COMMERCIAL_MEMBERSHIP_REVIEW_LABEL.kind.unknown_history }).first(), COMMERCIAL_MEMBERSHIP_DECISION_COPY.tribemate.recover_muted, 1);
                expect(await next.isDisabled()).toBe(true);
                await capture("admission-policy-membership-guardian", "preflight-captures.json");
              } else {
                await decide(rows.first(), COMMERCIAL_MEMBERSHIP_DECISION_COPY.guardian.retire, 0);
                await page.getByText(commercialMembershipReviewDoneMessage(ADMISSION_POLICY_DRAFT_COPY.activateNow), { exact: true }).first().waitFor({ timeout: 90_000 });
                await impact.waitFor({ state: "detached" });
                await page.getByRole("button", { name: ADMISSION_POLICY_DRAFT_COPY.activateNow, exact: true }).waitFor();
                await page.screenshot({ path: join(process.cwd(), "user-guides/assets/academy-admissions", `${engine}-${width}-policy-memberships-done.png`), fullPage: true });
                await capture("admission-policy-memberships-done", "memberships-done-captures.json");
              }
              expect(activationRequests).toBe(0);
            } finally { await context.close(); }
          }
        } finally { await browser.close(); }
      }));
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  it.each([{ engine: "chromium", browserType: chromium }, { engine: "webkit", browserType: webkit }])("should guide the setup, explain a platform block and open, pause, resume and edit admissions in $engine", async ({ engine, browserType }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const data = await preparePolicy(database, await readMessagingHostingSecurityConfig()), slug = `policy-${data.tribeId}`;
      /** Only the TuTribu team enables the admission evaluator; turning it off reproduces a block the leader cannot resolve. */
      const setEvaluator = (enabled: boolean) => database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.tribe_academy_settings set admission_enabled=${enabled} where tribe_id=${data.tribeId}`));
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const browser = await browserType.launch({ headless: true });
        try {
          const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
          try {
            await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${data.sessionToken}.${await makeSignature(data.sessionToken, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
            const page = await context.newPage(), runtimeErrors: string[] = [];
            page.on("pageerror", () => runtimeErrors.push("page_error"));
            page.on("console", (message) => { if (message.type() === "error" && /hydration|did not match/i.test(message.text())) runtimeErrors.push("hydration_error"); });
            const forbidden = [data.fixture.userId, data.sessionId, data.sessionToken, secret];
            const inbox = `${origin}/${slug}/academia/admissions`, settings = `${inbox}/settings`;
            const guideSelector = 'section[aria-labelledby="admission-setup-guide-title"]', rulesSelector = 'section[aria-label="Reglas de admisión"]';
            /** The same page is laid out at both widths, so each state is checked for overflow and screenshotted at 390 and 1280 px. */
            const shot = async (name: string) => {
              if (await page.locator(rulesSelector).count()) await page.locator(`${rulesSelector} [aria-busy="false"]`).first().waitFor({ timeout: 90_000 });
              for (const width of [390, 1280]) {
                await page.setViewportSize({ width, height: 900 });
                await page.waitForTimeout(300);
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
                await page.screenshot({ path: join(process.cwd(), "user-guides/assets/academy-admissions", `${engine}-${width}-${name}.png`), fullPage: true });
              }
            };
            /** Rules captures wait for the initial account check, so no control is shown disabled by a read in flight. */
            const capture = async (name: string, selector = rulesSelector) => {
              if (selector === rulesSelector) await page.locator(`${rulesSelector} [aria-busy="false"]`).first().waitFor({ timeout: 90_000 });
              await captureAdmissionReview(page, name, forbidden, "setup-captures.json", { selector });
            };
            const guide = page.getByRole("region", { name: ADMISSION_SETUP_GUIDE_COPY.title, exact: true });
            const next = page.getByRole("button", { name: "Continuar", exact: true });
            const confirmation = page.getByRole("checkbox", { name: "Revisé las reglas y quiero activar las admisiones.", exact: true });

            /** Nothing configured: the guide lists the steps in order with a single action toward the rules. */
            await page.goto(inbox, { waitUntil: "commit" });
            await guide.waitFor({ timeout: 90_000 });
            expect(await guide.getByRole("link").count()).toBe(1);
            await shot("setup-guide"); await capture("admission-setup-guide", guideSelector);
            await guide.getByRole("link", { name: ADMISSION_SETUP_STEP_COPY.rules.action }).click();
            await next.waitFor({ timeout: 90_000 });
            await shot("policy-step-admission"); await capture("admission-policy-step-admission");
            await next.click();
            await page.locator("legend", { hasText: "Cómo se contactan" }).waitFor();
            await shot("policy-step-contact"); await capture("admission-policy-step-contact");
            await next.click();
            await page.locator("legend", { hasText: "Recibir solicitudes" }).waitFor();
            await shot("policy-step-intake"); await capture("admission-policy-step-intake");
            await next.click();
            await confirmation.check({ timeout: 90_000 });
            await shot("policy-step-review"); await capture("admission-policy-step-review");

            /** A platform reason stops the chained action after saving: the rules stay as a draft and the guide stops offering to open. */
            await setEvaluator(false);
            await page.getByRole("button", { name: "Guardar y activar admisiones", exact: true }).click();
            await page.getByRole("group", { name: ADMISSION_POLICY_PLATFORM_COPY.title, exact: true }).waitFor({ timeout: 90_000 });
            await shot("policy-platform-block"); await capture("admission-policy-platform-block");
            await page.goto(inbox, { waitUntil: "commit" });
            await guide.getByText(ADMISSION_SETUP_STEP_COPY.open.platformBlocked, { exact: true }).waitFor({ timeout: 90_000 });
            await shot("setup-guide-platform"); await capture("admission-setup-guide-platform", guideSelector);

            /** Once the team enables admissions, the saved draft is published from its notice with «Activar ahora». */
            await setEvaluator(true);
            await page.goto(settings, { waitUntil: "commit" });
            const reviewDraft = page.getByRole("button", { name: ADMISSION_POLICY_DRAFT_COPY.action, exact: true });
            await reviewDraft.waitFor({ timeout: 90_000 });
            await shot("policy-draft"); await capture("admission-policy-draft");
            await reviewDraft.click();
            const activateNow = page.getByRole("button", { name: ADMISSION_POLICY_DRAFT_COPY.activateNow, exact: true });
            await activateNow.waitFor({ timeout: 90_000 });
            await confirmation.check();
            await capture("admission-policy-activate-now");
            await activateNow.click();
            await page.getByRole("heading", { name: "Admisiones abiertas", exact: true }).waitFor({ timeout: 90_000 });
            await page.getByText(ADMISSION_POLICY_BROWSER_COPY.activatedOpen, { exact: true }).first().waitFor({ timeout: 90_000 });
            await shot("policy-open"); await capture("admission-policy-open");

            /** Pausing asks for an internal reason; resuming and editing never reopen the rules by mistake. */
            await page.getByRole("button", { name: "Pausar admisiones", exact: true }).click();
            await page.getByLabel("Motivo de la pausa", { exact: true }).fill("Pausa sintética para revisar la lista");
            await capture("admission-policy-pause");
            await page.getByRole("button", { name: "Confirmar pausa", exact: true }).click();
            await page.getByRole("heading", { name: "Admisiones pausadas", exact: true }).waitFor({ timeout: 90_000 });
            await shot("policy-paused"); await capture("admission-policy-paused");
            await page.goto(inbox, { waitUntil: "commit" });
            await guide.getByText(ADMISSION_SETUP_STEP_COPY.open.paused, { exact: true }).waitFor({ timeout: 90_000 });
            await shot("setup-guide-paused"); await capture("admission-setup-guide-paused", guideSelector);
            await page.goto(settings, { waitUntil: "commit" });
            await page.getByRole("button", { name: "Reanudar admisiones", exact: true }).click({ timeout: 90_000 });
            await page.getByText(ADMISSION_POLICY_BROWSER_COPY.resumed, { exact: true }).first().waitFor({ timeout: 90_000 });
            await capture("admission-policy-resumed");
            await page.getByRole("button", { name: "Editar reglas", exact: true }).click();
            await next.click(); await next.click();
            await page.getByRole("checkbox", { name: "Revisé las reglas y quiero guardar los cambios.", exact: true }).waitFor();
            await shot("policy-edit-review"); await capture("admission-policy-edit-review");
            await page.getByRole("button", { name: "Cancelar edición", exact: true }).click();
            await page.getByRole("heading", { name: "Admisiones abiertas", exact: true }).waitFor();
            expect(runtimeErrors).toEqual([]);
          } finally { await context.close(); }
        } finally { await browser.close(); }
      }));
    });
  }, MEMBERSHIP_LIFECYCLE_VALIDATION_TIMEOUT_MS);

  for (const [engine, browserType] of [["chromium", chromium], ["webkit", webkit]] as const) {
    it(`should retain conflict drafts and use real guarded policy settings in ${engine} mobile/desktop`, async () => {
      await withAcademyAdmissionDatabase(async (database) => {
        const data = await preparePolicy(database, await readMessagingHostingSecurityConfig()), slug = `policy-${data.tribeId}`;
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
                const next = page.getByRole("button", { name: "Continuar", exact: true });
                await next.waitFor({ timeout: 90_000 });
                await next.click();
                const verification = page.getByRole("checkbox", { name: "Comprobar el contacto con un código" });
                /** The desktop pass turns codes on and saves them; the mobile pass starts from that saved draft. Codes stay on so the unprepared channel keeps activation blocked. */
                await verification.setChecked(true);
                await next.click();
                /** Each pass also flips intake, so the final action always carries a real change and sends the CAS update. */
                const intake = page.getByRole("checkbox", { name: "Recibir nuevas solicitudes" });
                await intake.setChecked(!(await intake.isChecked()));
                while (await next.count()) await next.click();
                const confirmation = page.getByRole("checkbox", { name: /Revisé las reglas/ });
                const final = page.getByRole("button", { name: "Guardar y activar admisiones", exact: true });
                expect(await final.isDisabled()).toBe(true);
                await confirmation.check({ timeout: 90_000 });
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
                await expectGuidedFlowFits(page, "Configurar reglas de admisión");
                await page.screenshot({ path: join(process.cwd(), "user-guides/assets/academy-admissions", `${engine}-${width}-policy-settings.png`), fullPage: true });
                if (width === 1280) await captureAdmissionReview(page, "admission-policy-settings", [data.fixture.userId, data.sessionId, data.sessionToken, secret], "policy-captures.json", { selector: "form" });
                stage = "create_concurrent_conflict";
                await database.withContext(data.fixture.own, (transaction) => transaction.execute(sql`update public.academy_admission_policies set allow_common_exceptions=not allow_common_exceptions,version=version+1 where tribe_id=${data.tribeId}`));
                const save = page.waitForResponse((response) => response.url().endsWith(`/api/tribes/${slug}/admissions/policy`) && response.request().method() === "PUT");
                await final.click();
                expect((await save).status()).toBe(409);
                await page.getByRole("alert").filter({ hasText: "No pudimos guardar las reglas. La configuración cambió. Revisala y volvé a confirmar." }).waitFor({ timeout: 90_000 });
                if (width === 1280) await captureAdmissionReview(page, "admission-policy-conflict", [data.fixture.userId, data.sessionId, data.sessionToken, secret], "policy-captures.json", { selector: "form" });
                stage = "retry_reads_current_without_erasing_draft";
                await page.getByRole("button", { name: "Reintentar", exact: true }).click();
                await page.getByText("La configuración cambió mientras tanto. Revisá el resumen y volvé a confirmar.", { exact: true }).waitFor({ timeout: 90_000 });
                expect(await confirmation.isChecked()).toBe(false);
                expect(await page.getByText("Código de comprobación", { exact: true }).locator("xpath=following-sibling::dd").textContent()).toBe("Sí");
                await confirmation.check({ timeout: 90_000 });
                stage = "save_then_attempt_activation";
                const saved = page.waitForResponse((response) => response.url().endsWith(`/api/tribes/${slug}/admissions/policy`) && response.request().method() === "PUT");
                await final.click();
                expect((await saved).status()).toBe(200);
                const requirements = page.getByRole("region", { name: "Lo que falta resolver" });
                await requirements.waitFor({ timeout: 90_000 });
                expect(await page.getByText("Tus reglas quedaron guardadas como borrador.", { exact: false }).count()).toBeGreaterThan(0);
                /** Codes need a prepared channel: the denied activation names that requirement and links to Conexión with the way back. */
                await requirements.getByText(ADMISSION_POLICY_ACTIVATION_REQUIREMENT_COPY.verification_unavailable, { exact: true }).waitFor({ timeout: 90_000 });
                expect(await requirements.getByRole("link", { name: ADMISSION_POLICY_DESTINATION_COPY.connection, exact: true }).getAttribute("href")).toBe(`/${slug}/academia/admissions/messaging/connections?return=policy-review`);
                expect(runtimeErrors).toEqual([]);
                if (width === 1280) await captureAdmissionReview(page, "admission-policy-saved", [data.fixture.userId, data.sessionId, data.sessionToken, secret], "policy-captures.json", { selector: "form" });
                process.stdout.write(JSON.stringify({ phase: "policy_browser_verified", engine, width }) + "\n");
              } catch (error) {
                process.stdout.write(JSON.stringify({ phase: "policy_browser_failure", engine, width, stage, errorName: error instanceof Error ? error.name : "unknown" }) + "\n");
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
