/** @vitest-environment node */
/** Exercises the explicit usage owner with real authority, configuration CAS and operation recovery. @module messaging-usage-policy-configuration-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase, type AcademyAdmissionTestDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { PostgresMessagingUsageOperations } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-usage-operations";
import { messagingUsagePolicyUpdateSchema } from "@/src/modules/messaging/infrastructure/api/messaging-request-schemas";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import type { MessagingUsageContext, MessagingUsageSensitiveContext } from "@/src/modules/messaging/domain/repositories/messaging-usage-operations";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { makeSignature } from "better-auth/crypto";
import { PostgresMessagingUsageOperationReader } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-usage-operation-reader";
import { messagingUsageOperationRecoverySchema } from "@/src/modules/messaging/application/results/messaging-usage-operation-result";
import { buildMessagingModule } from "@/src/modules/messaging/setup";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { chromium, webkit } from "@playwright/test";
import { captureAdmissionReview } from "@/tests/support/admission-review-capture";
import { join } from "node:path";

/**
 * Seeds current global session/recency and a canonical leader without a messaging connection or admission policy.
 * @param database - This run's checked disposable branch, with cleanup owned by the SQL helper.
 * @returns Actual guarded operation composition and the exact private contexts.
 */
async function prepareUsage(database: AcademyAdmissionTestDatabase) {
  const fixture = await prepareContactVerificationDatabase(database);
  await database.applyMigration("20261005095000_guard_global_identity_context.sql");
  await database.applyMigration("20261005101000_guard_admission_operation_identity.sql");
  const tribeId = randomUUID(), accountId = randomUUID(), sessionId = randomUUID(), subject = randomUUID(), sessionToken = randomUUID();
  const contexts = await database.withContext(fixture.own, async (transaction) => {
    const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
    const validUntil = new Date(now.getTime() + 540_000);
    await transaction.execute(sql`insert into public.tribes(id,name,slug,created_by) values (${tribeId},'Synthetic usage tribe',${`usage-${tribeId}`},${fixture.userId})`);
    await transaction.execute(sql`insert into public.tribe_members(tribe_id,user_id,role,status) values (${tribeId},${fixture.userId},'leader','active')`);
    await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},'google',${subject},${now},${now})`);
    await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${sessionToken},${new Date(now.getTime() + 3_600_000)},${now},${now})`);
    await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
    for (const operation of [REAUTHENTICATION_OPERATION.initializeMessagingUsage, REAUTHENTICATION_OPERATION.updateMessagingUsage]) {
      const intentId = randomUUID();
      await transaction.execute(sql`insert into public.global_reauthentication_intents(id,user_id,original_session_id,account_id,provider_subject,tribe_id,operation,resource_id,return_path,nonce_hash,state,created_at,expires_at,consumed_at) values (${intentId},${fixture.userId},${sessionId},${accountId},${subject},${tribeId},${operation},${tribeId},'/synthetic-usage',${randomBytes(32)},'consumed',${now},${validUntil},${now})`);
      await transaction.execute(sql`insert into public.recent_authentication_evidence(intent_id,user_id,account_id,provider_subject,session_id,tribe_id,operation,resource_id,authenticated_at,verified_at,valid_until) values (${intentId},${fixture.userId},${accountId},${subject},${sessionId},${tribeId},${operation},${tribeId},${now},${now},${validUntil})`);
    }
    const base = { actorUserId: fixture.userId, sessionId, tribeId, requestId: randomUUID() };
    const sensitive = { ...base, accountId, subject, authenticatedAt: now, validUntil, resourceId: tribeId };
    return {
      read: base satisfies MessagingUsageContext,
      initialize: { ...sensitive, operation: REAUTHENTICATION_OPERATION.initializeMessagingUsage } satisfies MessagingUsageSensitiveContext,
      update: { ...sensitive, operation: REAUTHENTICATION_OPERATION.updateMessagingUsage } satisfies MessagingUsageSensitiveContext,
    };
  });
  const execute = <Result>(_context: MessagingUsageContext, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext(fixture.own, run);
  const operations = new PostgresMessagingUsageOperations(execute, async () => fixture.config);
  const update = (expectedVersion: number, allowedCountries = ["AR"], operationId = randomUUID(), verificationDailyLimit = 100, notificationDailyLimit = 200) => operations.update(contexts.update, messagingUsagePolicyUpdateSchema.parse({ expectedVersion, allowedCountries, operationId, verificationDailyLimit, notificationDailyLimit, confirmed: true }));
  return { ...fixture, tribeId, sessionToken, contexts, execute, operations, update };
}

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("messaging usage configuration", () => {
  it("should compose current usage identity and exact recency through the real module without a connection and preserve read authentication failures", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareUsage(database), operationId = randomUUID();
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: fixture.userId, sessionId: fixture.contexts.read.sessionId }), (_scope, run) => database.withContext(fixture.own, run));
      const usageModule = buildMessagingModule({ accounts, execute: (_account, run) => database.withContext(fixture.own, run), clock: () => new Date() }).createUsageModule({ readSecurityConfig: async () => fixture.config });
      expect(await usageModule.useCases.initialize({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId, confirmed: true })).toMatchObject({ ok: true, value: { state: "completed", operationId, result: { version: 1, allowedCountries: [] } } });
      expect(await usageModule.useCases.read({ tribeId: fixture.tribeId, requestId: randomUUID() })).toMatchObject({ ok: true, value: { state: "configured", policy: { version: 1 } } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.contexts.read.sessionId}`));
      expect(await usageModule.useCases.read({ tribeId: fixture.tribeId, requestId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
      expect(await usageModule.operation.execute({ tribeId: fixture.tribeId, requestId: randomUUID(), operationId })).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.tenant_messaging_connections where tribe_id=${fixture.tribeId}) as connections,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries`)).rows)).toEqual([{ connections: 0, deliveries: 0 }]);
    });
  }, 180_000);

  it("should read original usage work without mutation recency and preserve its ledger while rejecting foreign or ambiguous namespaces", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareUsage(database), initializeId = randomUUID(), updateId = randomUUID();
      await fixture.operations.initialize(fixture.contexts.initialize, initializeId);
      await fixture.update(1, ["AR"], updateId);
      const reader = new PostgresMessagingUsageOperationReader(fixture.execute);
      const before = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id,version,state,completed_at,lease_owner,lease_until from public.academy_admission_operations where tribe_id=${fixture.tribeId} and idempotency_key=${initializeId}`)).rows);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where user_id=${fixture.userId} and tribe_id=${fixture.tribeId}`));
      expect(messagingUsageOperationRecoverySchema.parse(await reader.read(fixture.contexts.read, initializeId))).toMatchObject({ type: "initialize_messaging_usage", state: "completed", replayed: true, result: { version: 1, allowedCountries: [] } });
      expect(messagingUsageOperationRecoverySchema.parse(await reader.read(fixture.contexts.read, updateId))).toMatchObject({ type: "update_messaging_usage", result: { version: 2, allowedCountries: ["AR"] } });
      expect(await fixture.operations.read(fixture.contexts.read)).toMatchObject({ policy: { version: 2 } });
      expect(await reader.read(fixture.contexts.read, randomUUID())).toBeNull();
      await expect(reader.read({ ...fixture.contexts.read, tribeId: randomUUID() }, initializeId)).rejects.toMatchObject({ code: "permission_denied" });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id,version,state,completed_at,lease_owner,lease_until from public.academy_admission_operations where tribe_id=${fixture.tribeId} and idempotency_key=${initializeId}`)).rows)).toEqual(before);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.academy_admission_operations(actor_user_id,tribe_id,operation_type,idempotency_key,intent_fingerprint,fingerprint_key_id) values (${fixture.userId},${fixture.tribeId},'update_messaging_usage',${initializeId},${Buffer.alloc(32)},'synthetic')`));
      await expect(reader.read(fixture.contexts.read, initializeId)).rejects.toMatchObject({ code: "idempotency_conflict" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      await expect(reader.read(fixture.contexts.read, updateId)).rejects.toMatchObject({ code: "permission_denied" });
    });
  }, 180_000);

  it("should return absence and presentation defaults without creating resources or requiring a connection", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareUsage(database);
      expect(await fixture.operations.read(fixture.contexts.read)).toEqual({ state: "not_configured", policy: null });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select tribe_id from public.messaging_usage_policies where tribe_id=${fixture.tribeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.academy_admission_operations where tribe_id=${fixture.tribeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.tenant_messaging_connections where tribe_id=${fixture.tribeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select tribe_id from public.academy_admission_policies where tribe_id=${fixture.tribeId}`)).rows).toEqual([]);
      });
    });
  }, 120_000);

  it("should initialize concurrently once and preserve edited countries, zero quotas and consumption on another explicit start", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareUsage(database);
      const results = await Promise.all([randomUUID(), randomUUID()].map((operationId) => fixture.operations.initialize(fixture.contexts.initialize, operationId)));
      for (const result of results) expect(result).toMatchObject({ state: "completed", result: { version: 1, allowedCountries: [], verificationDailyLimit: 100, notificationDailyLimit: 200, consumption: { verificationToday: 0, notificationToday: 0 } } });
      expect(await fixture.update(1, ["AR"], randomUUID(), 0, 0)).toMatchObject({ state: "completed", result: { version: 2, allowedCountries: ["AR"], verificationDailyLimit: 0, notificationDailyLimit: 0 } });
      expect(await fixture.operations.initialize(fixture.contexts.initialize, randomUUID())).toMatchObject({ state: "completed", result: { version: 2, allowedCountries: ["AR"], verificationDailyLimit: 0, notificationDailyLimit: 0 } });
      expect(await fixture.operations.read(fixture.contexts.read)).toMatchObject({ state: "configured", policy: { version: 2, allowedCountries: ["AR"] } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as count from public.messaging_usage_policies where tribe_id=${fixture.tribeId}`)).rows)).toEqual([{ count: 1 }]);
    });
  }, 180_000);

  it("should compare normalized sets, reject stale new intents and replay the original commit before CAS", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareUsage(database);
      await fixture.operations.initialize(fixture.contexts.initialize, randomUUID());
      const operationId = randomUUID();
      const first = await fixture.update(1, [" us ", "ar"], operationId);
      expect(first).toMatchObject({ state: "completed", replayed: false, result: { version: 2, allowedCountries: ["AR", "US"] } });
      expect(await fixture.update(2, ["US", "AR"])).toMatchObject({ state: "completed", result: { version: 2 } });
      await expect(fixture.update(1, ["AR", "US"])).rejects.toMatchObject({ code: "usage_policy_conflict" });
      await fixture.update(2, ["AR"]);
      expect(await fixture.update(1, ["AR", "US"], operationId)).toMatchObject({ state: "completed", replayed: true, result: { version: 2, allowedCountries: ["AR", "US"] } });
      await expect(fixture.update(3, ["AR"], operationId)).rejects.toMatchObject({ code: "idempotency_conflict" });
      expect(await fixture.operations.read(fixture.contexts.read)).toMatchObject({ state: "configured", policy: { version: 3, allowedCountries: ["AR"] } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select id from public.message_deliveries where tribe_id=${fixture.tribeId}`)).rows).toEqual([]);
        expect((await transaction.execute(sql`select id from public.messaging_usage_events where tribe_id=${fixture.tribeId}`)).rows).toEqual([]);
      });
    });
  }, 180_000);

  it("should recheck current actor, canonical role, session and operation-scoped recency without divulging another tenant", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareUsage(database);
      await expect(fixture.operations.initialize({ ...fixture.contexts.initialize, actorUserId: randomUUID() }, randomUUID())).rejects.toMatchObject({ code: "permission_denied" });
      await expect(fixture.operations.initialize({ ...fixture.contexts.initialize, tribeId: randomUUID() }, randomUUID())).rejects.toMatchObject({ code: "permission_denied" });
      await expect(fixture.operations.initialize({ ...fixture.contexts.initialize, operation: REAUTHENTICATION_OPERATION.updateMessagingUsage }, randomUUID())).rejects.toMatchObject({ code: "permission_denied" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      await expect(fixture.operations.read(fixture.contexts.read)).rejects.toMatchObject({ code: "permission_denied" });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='leader' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where user_id=${fixture.userId}`));
      await expect(fixture.operations.initialize(fixture.contexts.initialize, randomUUID())).rejects.toMatchObject({ code: "reauthentication_required" });
      expect(await fixture.operations.read(fixture.contexts.read)).toEqual({ state: "not_configured", policy: null });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.session where id=${fixture.contexts.read.sessionId}`));
      await expect(fixture.operations.read(fixture.contexts.read)).rejects.toMatchObject({ code: "authentication_required" });
    });
  }, 180_000);

  it("should recover a committed configuration after response loss without repeating its version or inventing progress", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareUsage(database);
      await fixture.operations.initialize(fixture.contexts.initialize, randomUUID());
      let transactions = 0;
      const interrupted = new PostgresMessagingUsageOperations(async (context, run) => {
        const result = await fixture.execute(context, run);
        transactions += 1;
        if (transactions === 2) throw new Error("Synthetic usage commit response lost");
        return result;
      }, async () => fixture.config);
      const input = messagingUsagePolicyUpdateSchema.parse({ expectedVersion: 1, allowedCountries: ["AR"], operationId: randomUUID(), verificationDailyLimit: 40, notificationDailyLimit: 50, confirmed: true });
      expect(await interrupted.update(fixture.contexts.update, input)).toMatchObject({ state: "completed", replayed: true, result: { version: 2 } });
      expect(await fixture.operations.update(fixture.contexts.update, input)).toMatchObject({ state: "completed", replayed: true, result: { version: 2 } });
      expect(await fixture.operations.read(fixture.contexts.read)).toMatchObject({ state: "configured", policy: { version: 2, verificationDailyLimit: 40, notificationDailyLimit: 50 } });
    });
  }, 180_000);

  it("should preserve a charged unknown attempt across quota reduction and enforce current platform ceilings", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareUsage(database);
      await database.applyMigration("20261005092500_guard_messaging_attempts.sql");
      await fixture.operations.initialize(fixture.contexts.initialize, randomUUID());
      const connectionId = randomUUID(), deliveryId = randomUUID(), leaseToken = randomUUID();
      const marker = await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`insert into public.tenant_messaging_connections(id,tribe_id,contributed_by_user_id,state,environment,security_epoch,is_selected,is_candidate,selected_version) values (${connectionId},${fixture.tribeId},${fixture.userId},'active',${fixture.config.environment},${fixture.config.securityEpoch},true,false,1)`);
        await transaction.execute(sql`insert into public.messaging_connection_versions(connection_id,tribe_id,version,environment,security_epoch,email_sender_id,credential_validation_status,credential_validated_at,is_test_mode) values (${connectionId},${fixture.tribeId},1,${fixture.config.environment},${fixture.config.securityEpoch},'synthetic-usage-sender','valid',clock_timestamp(),false)`);
        await transaction.execute(sql`insert into public.messaging_connection_capabilities(tribe_id,connection_id,connection_version,channel,sender_id,state,checked_at,tested_at) values (${fixture.tribeId},${connectionId},1,'email','synthetic-usage-sender','prepared',clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.message_deliveries(id,tribe_id,connection_id,connection_version,environment,security_epoch,purpose,source_resource_id,actor_user_id,recipient_ref,channel,idempotency_key,payload_fingerprint,payload_mac_key_id,frozen_intent,queued_usage_policy_version,deadline_at) values (${deliveryId},${fixture.tribeId},${connectionId},1,${fixture.config.environment},${fixture.config.securityEpoch},'admission_notification',${randomUUID()},${fixture.userId},${randomUUID()},'email',${randomUUID()},${randomBytes(32)},'synthetic-payload','{}',1,clock_timestamp()+interval '1 hour')`);
        const claim = (await transaction.execute<{ delivery_id: string; delivery_version: number }>(sql`select * from public.claim_messaging_deliveries(${leaseToken},1,90)`)).rows[0];
        return (await transaction.execute<{ outcome: string; attempt_id: string }>(sql`select * from public.authorize_messaging_delivery_attempt(${claim.delivery_id},${leaseToken},${claim.delivery_version},${fixture.config.environment},${fixture.config.securityEpoch})`)).rows[0];
      });
      expect(marker.outcome).toBe("authorized");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`select * from public.complete_messaging_delivery_attempt(${marker.attempt_id},${leaseToken},1,'unknown',null,null,'synthetic_response_lost')`));
      expect(await fixture.operations.read(fixture.contexts.read)).toMatchObject({ policy: { version: 1, consumption: { verificationToday: 0, notificationToday: 1 } } });
      expect(await fixture.update(1, ["AR"], randomUUID(), 0, 0)).toMatchObject({ state: "completed", result: { version: 2, consumption: { notificationToday: 1 } } });
      expect(await fixture.operations.initialize(fixture.contexts.initialize, randomUUID())).toMatchObject({ state: "completed", result: { version: 2, notificationDailyLimit: 0, consumption: { notificationToday: 1 } } });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state from public.message_deliveries where id=${deliveryId}`)).rows).toEqual([{ state: "unknown" }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where attempt_id=${marker.attempt_id}`)).rows).toEqual([{ state: "consumed" }]);
        expect((await transaction.execute(sql`select version from public.messaging_connection_versions where connection_id=${connectionId}`)).rows).toEqual([{ version: 1 }]);
        await transaction.execute(sql`update public.messaging_usage_policies set platform_notification_daily_maximum=0,version=version+1 where tribe_id=${fixture.tribeId}`);
      });
      await expect(fixture.update(3, ["AR"], randomUUID(), 0, 1)).rejects.toMatchObject({ code: "invalid_input" });
      expect(await fixture.operations.read(fixture.contexts.read)).toMatchObject({ policy: { version: 3, notificationDailyLimit: 0, consumption: { notificationToday: 1 } } });
    });
  }, 180_000);
});

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native early usage browser", () => {
  it("should open early usage from a truly absent admission policy without initializing either resource", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareUsage(database), slug = `usage-${fixture.tribeId}`;
      await database.applyMigration("20261005093000_guard_academy_membership_sources.sql");
      await database.applyMigration("20261007001000_read_public_admission_overview.sql");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${fixture.tribeId},'academy',true)`));
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        for (const [engine, browserType] of [["chromium", chromium], ["webkit", webkit]] as const) {
          const browser = await browserType.launch({ headless: true });
          try {
            const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
            try {
              await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
              const page = await context.newPage();
              process.stdout.write(JSON.stringify({ phase: "usage_early_navigation_begin", engine }) + "\n");
              await page.goto(`${origin}/${slug}/academia/admissions/settings`, { waitUntil: "commit" });
              await page.getByRole("link", { name: "Configurar países y cupos de mensajería" }).click({ timeout: 90_000 });
              await page.getByRole("button", { name: "Iniciar configuración de uso" }).waitFor({ timeout: 90_000 });
              expect(await page.getByText(/todavía no está configurado/).count()).toBe(1);
              await page.getByRole("link", { name: "Volver a las reglas de admisión" }).click();
              await page.getByRole("button", { name: "Preparar configuración" }).waitFor({ timeout: 90_000 });
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
              process.stdout.write(JSON.stringify({ phase: "usage_early_navigation_verified", engine }) + "\n");
            } finally { process.stdout.write(JSON.stringify({ phase: "usage_context_close_begin", engine, connected: browser.isConnected() }) + "\n"); await context.close(); process.stdout.write(JSON.stringify({ phase: "usage_context_closed", engine }) + "\n"); }
          } finally { process.stdout.write(JSON.stringify({ phase: "usage_browser_close_begin", engine, connected: browser.isConnected() }) + "\n"); if (browser.isConnected()) await browser.close(); process.stdout.write(JSON.stringify({ phase: "usage_browser_closed", engine }) + "\n"); }
        }
      }));
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.messaging_usage_policies where tribe_id=${fixture.tribeId}) as usage,(select count(*)::int from public.academy_admission_policies where tribe_id=${fixture.tribeId}) as admissions,(select count(*)::int from public.academy_admission_operations where tribe_id=${fixture.tribeId}) as operations,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries`)).rows)).toEqual([{ usage: 0, admissions: 0, operations: 0, deliveries: 0 }]);
    });
  }, 300_000);

  for (const [engine, browserType] of [["chromium", chromium], ["webkit", webkit]] as const) {
    it(`should configure a saved country before any connection and preserve conflict drafts in ${engine} mobile/desktop`, async () => {
      await withAcademyAdmissionDatabase(async (database) => {
        const fixture = await prepareUsage(database), slug = `usage-${fixture.tribeId}`;
        await database.applyMigration("20261005093000_guard_academy_membership_sources.sql");
        await database.applyMigration("20261007001000_read_public_admission_overview.sql");
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${fixture.tribeId},'academy',true)`));
        await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
          const browser = await browserType.launch({ headless: true });
          try {
            for (const width of [1280, 390]) {
              const context = await browser.newContext({ viewport: { width, height: 900 } });
              let stage = "open_usage";
              try {
                await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
                const page = await context.newPage(), errors: string[] = [];
                const pendingRequests = new Map<string, { method: string; path: string }>();
                page.on("request", (request) => { const path = new URL(request.url()).pathname; if (path.endsWith("/api/auth/get-session") || path.endsWith("/messaging/usage-policy")) { const safePath = path.endsWith("/api/auth/get-session") ? "native-session" : "usage-policy"; pendingRequests.set(request.url(), { method: request.method(), path: safePath }); process.stdout.write(JSON.stringify({ phase: "usage_request_started", engine, width, method: request.method(), path: safePath }) + "\n"); } });
                page.on("requestfinished", (request) => { pendingRequests.delete(request.url()); });
                page.on("requestfailed", (request) => { pendingRequests.delete(request.url()); });
                page.on("pageerror", () => errors.push("page_error"));
                page.on("console", (message) => { if (message.type() === "error" && /hydration|did not match/i.test(message.text())) errors.push("hydration_error"); });
                if (width === 1280) {
                  stage = "navigate_from_policy";
                  await page.goto(`${origin}/${slug}/academia/admissions/settings`, { waitUntil: "commit" });
                  await page.getByRole("link", { name: "Configurar países y cupos de mensajería" }).click({ timeout: 90_000 });
                } else await page.goto(`${origin}/${slug}/academia/admissions/messaging`, { waitUntil: "commit" });
                const confirmation = page.getByRole("checkbox", { name: /Revisé los países/ });
                await confirmation.waitFor({ timeout: 90_000 }); await confirmation.check({ timeout: 90_000 });
                const initial = page.getByRole("button", { name: "Iniciar configuración de uso" });
                if (await initial.count()) {
                  stage = "initialize_usage";
                  await initial.click();
                  await page.getByRole("button", { name: "Guardar países y cupos" }).waitFor({ timeout: 90_000 });
                  expect(await confirmation.isChecked()).toBe(false);
                }
                stage = "prepare_country";
                const removeArgentina = page.getByRole("button", { name: "Quitar Argentina del borrador" });
                if (!await removeArgentina.count()) { await page.getByRole("combobox", { name: "Agregar país al borrador" }).click(); await page.getByRole("option", { name: "Argentina", exact: true }).click(); }
                const verificationInput = page.getByRole("spinbutton", { name: "Códigos por día" });
                if (await verificationInput.inputValue() === "0") await verificationInput.fill("1");
                await verificationInput.fill("0");
                expect(await confirmation.isChecked()).toBe(false);
                if (width === 1280) await captureAdmissionReview(page, "messaging-usage-draft", [fixture.userId, fixture.contexts.read.sessionId, fixture.sessionToken, secret], "usage-captures.json", { selector: 'section[class*="MessagingUsage"]' });
                stage = "save_country";
                const savedResponse = page.waitForResponse((response) => response.url().endsWith(`/api/tribes/${slug}/messaging/usage-policy`) && response.request().method() === "PUT", { timeout: 90_000 });
                await confirmation.check();
                const formValidity = await page.locator('section[class*="MessagingUsage"] form').evaluate((element) => ({ valid: (element as HTMLFormElement).checkValidity(), fields: Array.from((element as HTMLFormElement).elements).filter((field) => "validity" in field).map((field) => ({ tag: field.tagName, type: (field as HTMLInputElement).type, value: (field as HTMLInputElement).value, valid: (field as HTMLInputElement).validity.valid })) }));
                process.stdout.write(JSON.stringify({ phase: "usage_form_validity", engine, width, ...formValidity }) + "\n");
                await page.getByRole("button", { name: "Guardar países y cupos" }).click();
                const savedStatus = (await savedResponse).status();
                process.stdout.write(JSON.stringify({ phase: "usage_save_response", engine, width, status: savedStatus }) + "\n");
                expect(savedStatus).toBe(200);
                await page.getByText("Los países y cupos quedaron guardados.", { exact: true }).first().waitFor({ timeout: 90_000 });
                await page.getByText("Países guardados: Argentina.", { exact: true }).waitFor();
                expect(await page.getByRole("spinbutton", { name: "Códigos por día" }).inputValue()).toBe("0");
                if (width === 1280) await captureAdmissionReview(page, "messaging-usage-saved", [fixture.userId, fixture.contexts.read.sessionId, fixture.sessionToken, secret], "usage-captures.json", { selector: 'section[class*="MessagingUsage"]' });
                stage = "concurrent_conflict";
                await page.getByRole("spinbutton", { name: "Avisos por día" }).fill("0");
                await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.messaging_usage_policies set notification_daily_limit=notification_daily_limit+1,version=version+1 where tribe_id=${fixture.tribeId}`));
                await confirmation.check(); await page.getByRole("button", { name: "Guardar países y cupos" }).click();
                await page.getByRole("button", { name: "Consultar uso actual" }).waitFor({ timeout: 90_000 });
                expect(await page.getByRole("spinbutton", { name: "Avisos por día" }).inputValue()).toBe("0");
                if (width === 1280) await captureAdmissionReview(page, "messaging-usage-conflict", [fixture.userId, fixture.contexts.read.sessionId, fixture.sessionToken, secret], "usage-captures.json", { selector: 'section[class*="MessagingUsage"]' });
                stage = "read_current_and_save";
                await page.getByRole("button", { name: "Consultar uso actual" }).click(); await confirmation.check({ timeout: 90_000 });
                await page.getByRole("button", { name: "Guardar países y cupos" }).click();
                await page.getByText("Los países y cupos quedaron guardados.", { exact: true }).first().waitFor({ timeout: 90_000 });
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
                await page.screenshot({ path: join(process.cwd(), "user-guides/assets/academy-admissions", `${engine}-${width}-usage.png`), fullPage: true });
                expect(errors).toEqual([]);
                process.stdout.write(JSON.stringify({ phase: "usage_browser_verified", engine, width }) + "\n");
              } catch (error) {
                process.stdout.write(JSON.stringify({ phase: "usage_browser_failure", engine, width, stage, errorName: error instanceof Error ? error.name : "unknown" }) + "\n");
                const failedPage = context.pages()[0];
                if (failedPage && !failedPage.isClosed()) {
                  const feedback = await failedPage.locator('section[class*="MessagingUsage"] [role="alert"]').allTextContents().catch(() => []);
                  process.stdout.write(JSON.stringify({ phase: "usage_safe_feedback", engine, width, feedback: feedback.map((message) => message.slice(0, 500)) }) + "\n");
                  await failedPage.screenshot({ path: join(process.cwd(), "user-guides/assets/academy-admissions", `${engine}-${width}-usage-failure.png`), fullPage: true }).catch(() => undefined);
                  const controls = await failedPage.evaluate(() => Array.from(document.querySelectorAll('section[class*="MessagingUsage"] button, section[class*="MessagingUsage"] input')).map((element) => ({ tag: element.tagName, text: element.tagName === "BUTTON" ? element.textContent?.trim().slice(0, 90) : undefined, disabled: element.hasAttribute("disabled"), checked: element.getAttribute("aria-checked"), value: element.tagName === "INPUT" ? (element as HTMLInputElement).value : undefined })));
                  process.stdout.write(JSON.stringify({ phase: "usage_control_state", engine, width, controls }) + "\n");
                }
                const waits = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,wait_event_type,wait_event,cardinality(pg_blocking_pids(pid))::int as blockers from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and state<>'idle'`)).rows);
                process.stdout.write(JSON.stringify({ phase: "usage_database_waits", engine, width, waits }) + "\n");
                throw new Error("Native early usage failed; inspect the safe stage diagnostic");
              } finally { process.stdout.write(JSON.stringify({ phase: "usage_context_close_begin", engine, connected: browser.isConnected() }) + "\n"); await context.close(); process.stdout.write(JSON.stringify({ phase: "usage_context_closed", engine }) + "\n"); }
            }
          } finally { process.stdout.write(JSON.stringify({ phase: "usage_browser_close_begin", engine, connected: browser.isConnected() }) + "\n"); if (browser.isConnected()) await browser.close(); process.stdout.write(JSON.stringify({ phase: "usage_browser_closed", engine }) + "\n"); }
        }));
        expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.tenant_messaging_connections where tribe_id=${fixture.tribeId}) as connections,(select count(*)::int from public.academy_admission_policies where tribe_id=${fixture.tribeId}) as admissions,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries,(select count(*)::int from public.messaging_usage_events where tribe_id=${fixture.tribeId}) as events`)).rows)).toEqual([{ connections: 0, admissions: 0, deliveries: 0, events: 0 }]);
      });
    }, 600_000);
  }
});

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native early usage HTTP", () => {
  it("should recover original usage through the actual route without recency and close an expired global session without changing the ledger", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareUsage(database), slug = `usage-${fixture.tribeId}`, operationId = randomUUID();
      await database.applyMigration("20261005093000_guard_academy_membership_sources.sql");
      await database.applyMigration("20261007001000_read_public_admission_overview.sql");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${fixture.tribeId},'academy',true)`));
      await fixture.operations.initialize(fixture.contexts.initialize, operationId);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where user_id=${fixture.userId} and tribe_id=${fixture.tribeId}`));
      const before = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id,version,state,public_result,completed_at,lease_owner,lease_until from public.academy_admission_operations where tribe_id=${fixture.tribeId} and idempotency_key=${operationId}`)).rows);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const cookie = `better-auth.session_token=${encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`)}`;
        const path = `${origin}/api/tribes/${slug}/messaging/usage-policy/operations/${operationId}`;
        const original = await fetch(path, { headers: { cookie } });
        expect(original.status).toBe(200);
        expect(await original.json()).toMatchObject({ type: "initialize_messaging_usage", state: "completed", replayed: true, result: { version: 1, allowedCountries: [] } });
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${fixture.contexts.read.sessionId}`));
        const expired = await fetch(path, { headers: { cookie } });
        expect(expired.status).toBe(401);
        expect(await expired.json()).toMatchObject({ code: "authentication_required" });
      }));
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id,version,state,public_result,completed_at,lease_owner,lease_until from public.academy_admission_operations where tribe_id=${fixture.tribeId} and idempotency_key=${operationId}`)).rows)).toEqual(before);
    });
  }, 300_000);

  it("should configure countries before any connection or admission policy using real leader recency, CAS and original replay", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareUsage(database), slug = `usage-${fixture.tribeId}`;
      await database.applyMigration("20261005093000_guard_academy_membership_sources.sql");
      await database.applyMigration("20261007001000_read_public_admission_overview.sql");
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.tribe_academy_settings(tribe_id,access_model,admission_enabled) values (${fixture.tribeId},'academy',true)`));
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, slug, async (origin, secret) => {
        const cookie = `better-auth.session_token=${encodeURIComponent(`${fixture.sessionToken}.${await makeSignature(fixture.sessionToken, secret)}`)}`, base = `${origin}/api/tribes/${slug}/messaging/usage-policy`;
        const request = (method: string, body?: object, query = "") => fetch(`${base}${query}`, { method, headers: { cookie, origin, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
        const absent = await request("GET");
        expect(absent.status).toBe(200);
        expect(await absent.json()).toEqual({ state: "not_configured", policy: null });
        expect((await request("GET", undefined, "?role=leader")).status).toBe(400);
        expect((await request("POST", { operationId: randomUUID(), confirmed: true, allowedCountries: ["AR"] })).status).toBe(400);
        const initializeId = randomUUID();
        const created = await request("POST", { operationId: initializeId, confirmed: true });
        expect(created.status).toBe(200);
        expect(await created.json()).toMatchObject({ state: "completed", operationId: initializeId, result: { version: 1, allowedCountries: [], verificationDailyLimit: 100, notificationDailyLimit: 200 } });
        const updateId = randomUUID(), update = { operationId: updateId, confirmed: true, expectedVersion: 1, allowedCountries: [" ar ", "us"], verificationDailyLimit: 0, notificationDailyLimit: 200 };
        const saved = await request("PUT", update);
        expect(saved.status).toBe(200);
        expect(await saved.json()).toMatchObject({ state: "completed", operationId: updateId, result: { version: 2, allowedCountries: ["AR", "US"], verificationDailyLimit: 0 } });
        expect((await request("PUT", { ...update, operationId: randomUUID() })).status).toBe(409);
        expect(await (await request("PUT", { ...update, operationId: randomUUID(), expectedVersion: 2 })).json()).toMatchObject({ result: { version: 2 } });
        expect(await (await request("PUT", { ...update, operationId: randomUUID(), expectedVersion: 2, allowedCountries: ["AR"] })).json()).toMatchObject({ result: { version: 3, allowedCountries: ["AR"] } });
        expect(await (await request("PUT", update)).json()).toMatchObject({ replayed: true, result: { version: 2, allowedCountries: ["AR", "US"] } });
        expect(await (await request("GET")).json()).toMatchObject({ state: "configured", policy: { version: 3, allowedCountries: ["AR"], verificationDailyLimit: 0 } });
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.recent_authentication_evidence set invalidated_at=clock_timestamp() where user_id=${fixture.userId} and tribe_id=${fixture.tribeId}`));
        const deniedId = randomUUID();
        expect((await request("PUT", { ...update, operationId: deniedId, expectedVersion: 3, hasRecentAuthentication: true })).status).toBe(400);
        expect((await request("PUT", { ...update, operationId: deniedId, expectedVersion: 3 })).status).toBe(401);
        expect((await request("GET")).status).toBe(200);
        const original = await request("GET", undefined, `/operations/${initializeId}`);
        expect(original.status).toBe(200);
        expect(await original.json()).toMatchObject({ type: "initialize_messaging_usage", state: "completed", replayed: true, result: { version: 1, allowedCountries: [] } });
        expect((await request("GET", undefined, `/operations/${randomUUID()}`)).status).toBe(404);
        expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select count(*)::int as total from public.academy_admission_operations where tribe_id=${fixture.tribeId} and idempotency_key=${deniedId}`)).rows)).toEqual([{ total: 0 }]);
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.tribeId} and user_id=${fixture.userId}`));
        expect((await request("GET")).status).toBe(403);
        expect((await request("GET", undefined, `/operations/${initializeId}`)).status).toBe(403);
        expect((await request("POST", { operationId: randomUUID(), confirmed: true })).status).toBe(403);
      }));
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.tenant_messaging_connections where tribe_id=${fixture.tribeId}) as connections,(select count(*)::int from public.academy_admission_policies where tribe_id=${fixture.tribeId}) as admissions,(select count(*)::int from public.message_deliveries where tribe_id=${fixture.tribeId}) as deliveries,(select count(*)::int from public.messaging_usage_events where tribe_id=${fixture.tribeId}) as events`)).rows)).toEqual([{ connections: 0, admissions: 0, deliveries: 0, events: 0 }]);
    });
  }, 600_000);
});
