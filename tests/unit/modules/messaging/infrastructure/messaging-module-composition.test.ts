/** @vitest-environment node */
/** Exercises real request/work module composition with SQL, crypto and SDK transport. @module messaging-module-composition-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationIssuer } from "@/tests/support/contact-verification-issuance-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { buildMessagingModule, buildMessagingWorkModule } from "@/src/modules/messaging/setup";
import { createRequestMessagingMaintenanceAuthorizer } from "@/src/modules/messaging/infrastructure/auth/request-maintenance-authorizer";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import { ZavuNotificationDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-notification-delivery-sender";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
import type { MessagingDispatchDiagnostic } from "@/src/modules/messaging/domain/repositories/message-delivery-sender";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("messaging module composition", () => {
  it("should compose usage and sensitive context from real current identity and deny revoked leadership", async ({ task }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database);
      for (const migration of ["20261005095000_guard_global_identity_context.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006230000_bind_credential_validation_usage.sql"]) await database.applyMigration(migration);
      const accountId = randomUUID(), sessionId = randomUUID(), subject = randomUUID();
      await database.withContext(fixture.own, async (transaction) => {
        const now = new Date((await transaction.execute<{ now: string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        await transaction.execute(sql`insert into public.account(id,"userId","providerId","accountId","createdAt","updatedAt") values (${accountId},${fixture.userId},'google',${subject},${now},${now})`);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},${new Date(now.getTime()+3_600_000)},${now},${now})`);
        await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${fixture.userId},${accountId},${subject},${fixture.own.email})`);
      });
      let featureTransaction = false;
      let currentSessionId = sessionId;
      let expireOnIdentityRead: number | null = null, identityReads = 0;
      let expireAfterStartedOperationId: string | undefined;
      const accounts = new PostgresAuthenticatedAccountProvider(async () => {
        identityReads += 1;
        if (identityReads === expireOnIdentityRead) await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${sessionId}`));
        return { userId: fixture.userId, sessionId: currentSessionId };
      }, (identity, run) => {
        if (featureTransaction) Object.assign(task.meta, { nestedAccountLookup: { identityReads, featureTransaction } });
        expect(featureTransaction).toBe(false);
        return database.withContext({ userId: identity.userId, email: fixture.own.email }, run);
      });
      const messagingRoot = buildMessagingModule({ accounts, clock: () => new Date(), execute: async (account, run) => {
        featureTransaction = true;
        try { return await database.withContext({ userId: account.userId, email: account.normalizedEmail }, run); }
        finally {
          featureTransaction = false;
          if (expireAfterStartedOperationId) {
            const original = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id from public.academy_admission_operations where idempotency_key=${expireAfterStartedOperationId} and state='started'`)).rows);
            if (original.length) { expireAfterStartedOperationId = undefined; await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${sessionId}`)); }
          }
        }
      } });
      const messaging = messagingRoot.createRequestModule({ selection: "selected", readSecurityConfig: async () => fixture.config });
      const requestId = randomUUID();
      expect(await messaging.useCases.manageUsage.read({ tribeId: fixture.scope.tribeId, requestId })).toMatchObject({ ok: true, value: { state: "configured", policy: { version: 1, allowedCountries: [] } } });
      const update = { tribeId: fixture.scope.tribeId, requestId, operationId: randomUUID(), confirmed: true as const, expectedVersion: 1, allowedCountries: ["AR"], verificationDailyLimit: 100, notificationDailyLimit: 200 };
      expect(await messaging.useCases.manageUsage.update(update)).toMatchObject({ ok: true, value: { state: "completed", result: { version: 2, allowedCountries: ["AR"] } } });
      expect(await messaging.useCases.manageUsage.update(update)).toMatchObject({ ok: true, value: { replayed: true, result: { version: 2 } } });
      const resolved = await messaging.useCases.resolveContext.execute({ tribeId: fixture.scope.tribeId, connectionId: fixture.scope.connectionId, operation: REAUTHENTICATION_OPERATION.validateMessagingConnection, requestId });
      expect(resolved).toMatchObject({ allowed: true, context: { actorUserId: fixture.userId, sessionId, connectionVersion: 1 } });
      if (!resolved.allowed) throw new Error("Synthetic messaging context did not resolve");
      expect(await messaging.useCases.reserveCredentialValidation.execute({ context: resolved.context, operationId: randomUUID() })).toMatchObject({ outcome: "reserved" });
      const replacementSessionId = randomUUID();
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${replacementSessionId},${fixture.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`));
      currentSessionId = replacementSessionId;
      expect(await messaging.useCases.reserveCredentialValidation.execute({ context: resolved.context, operationId: randomUUID() })).toMatchObject({ outcome: "denied", code: "authentication_required" });
      currentSessionId = sessionId;
      expireOnIdentityRead = 5;
      identityReads = 0;
      const revokedMutation = { ...update, operationId: randomUUID(), expectedVersion: 2, allowedCountries: ["US"] };
      expect(await messaging.useCases.manageUsage.update(revokedMutation)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id from public.academy_admission_operations where idempotency_key=${revokedMutation.operationId}`)).rows)).toHaveLength(0);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+interval '1 hour' where id=${sessionId}`));
      expireOnIdentityRead = null;
      identityReads = 0;
      const revokedEffect = { ...revokedMutation, operationId: randomUUID() };
      expireAfterStartedOperationId = revokedEffect.operationId;
      expect(await messaging.useCases.manageUsage.update(revokedEffect)).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state,public_result from public.academy_admission_operations where idempotency_key=${revokedEffect.operationId}`)).rows)).toEqual([{ state: "started", public_result: null }]);
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select version,allowed_countries from public.messaging_usage_policies where tribe_id=${fixture.scope.tribeId}`)).rows)).toEqual([{ version: 2, allowed_countries: ["AR"] }]);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+interval '1 hour' where id=${sessionId}`));
      expireOnIdentityRead = 2;
      identityReads = 0;
      const diagnostic = { tribeId: fixture.scope.tribeId, connectionId: fixture.scope.connectionId, diagnosticId: randomUUID(), operationId: randomUUID(), code: "123456", requestId };
      const diagnosticResource = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ state: string; connection_retired: boolean; version_retired: boolean; secret_retired: boolean; contribution_matches_actor: boolean }>(sql`select connection.state,connection.retired_at is not null as connection_retired,version.retired_at is not null as version_retired,envelope.retired_at is not null as secret_retired,connection.contributed_by_user_id=${fixture.userId} as contribution_matches_actor from public.tenant_messaging_connections connection left join public.messaging_connection_versions version on version.connection_id=connection.id and version.tribe_id=connection.tribe_id and version.version=${fixture.scope.connectionVersion} left join public.messaging_secret_envelopes envelope on envelope.secret_ref=version.secret_ref where connection.id=${fixture.scope.connectionId} and connection.tribe_id=${fixture.scope.tribeId}`)).rows[0]);
      const diagnosticResult = await messaging.useCases.verifyDiagnostic.execute(diagnostic);
      Object.assign(task.meta, { diagnosticExpiry: { diagnosticResource, identityReads, ok: diagnosticResult.ok, code: diagnosticResult.ok ? null : diagnosticResult.failure.code } });
      expect(diagnosticResult).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select id from public.academy_admission_operations where idempotency_key=${diagnostic.operationId}`)).rows)).toHaveLength(0);
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+interval '1 hour' where id=${sessionId}`));
      expireOnIdentityRead = 5;
      identityReads = 0;
      /** @returns Actual native session/binding/evidence state without tokens, account claims or another identity-provider read. */
      const readSessionState = () => database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ session_active: boolean; binding_present: boolean; binding_invalidated: boolean }>(sql`select session."expiresAt">clock_timestamp() as session_active,binding.session_id is not null as binding_present,binding.invalidated_at is not null as binding_invalidated from public.session session left join public.global_session_identity_bindings binding on binding.session_id=session.id and binding.user_id=session."userId" where session.id=${sessionId} and session."userId"=${fixture.userId}`)).rows[0]);
      const beforeUsageRead = await readSessionState();
      const expiredUsage = await messaging.useCases.manageUsage.read({ tribeId: fixture.scope.tribeId, requestId });
      const afterUsageRead = await readSessionState();
      Object.assign(task.meta, { expiryRead: { beforeUsageRead, afterUsageRead, identityReads, ok: expiredUsage.ok, code: expiredUsage.ok ? null : expiredUsage.failure.code } });
      expect(expiredUsage).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
      expect(identityReads).toBe(5);
      // Leadership loss suspends the connection; keep it after tests that require an active resource.
      expireOnIdentityRead = null;
      identityReads = 0;
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()+interval '1 hour' where id=${sessionId}`));
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='guardian' where tribe_id=${fixture.scope.tribeId} and user_id=${fixture.userId}`));
      expect(await messaging.useCases.manageUsage.read({ tribeId: fixture.scope.tribeId, requestId })).toMatchObject({ ok: false, failure: { code: "permission_denied" } });
      expect(await messaging.useCases.resolveContext.execute({ tribeId: fixture.scope.tribeId, connectionId: fixture.scope.connectionId, operation: REAUTHENTICATION_OPERATION.validateMessagingConnection, requestId })).toMatchObject({ allowed: false, failure: { code: "permission_denied" } });
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.tribe_members set role='leader' where tribe_id=${fixture.scope.tribeId} and user_id=${fixture.userId}`));
      expect(await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select state from public.tenant_messaging_connections where id=${fixture.scope.connectionId}`)).rows)).toEqual([{ state: "suspended" }]);
    });
  }, 240_000);

  it("should use the separate bearer worker root and real prepared SDK without a human session or RPC under locks", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database);
      for (const migration of ["20261005092500_guard_messaging_attempts.sql", "20261005100000_guard_messaging_secret_retirement.sql", "20261006140000_claim_messaging_deliveries_fairly.sql", "20261006160000_purge_verification_delivery_material.sql"]) await database.applyMigration(migration);
      const issued = await fixture.issue();
      if (issued.state !== "completed" || issued.result.outcome !== "issued") throw new Error("Synthetic composed worker issuance did not complete");
      const secret = randomUUID();
      let currentSecret: string | undefined = secret;
      const authorize = createRequestMessagingMaintenanceAuthorizer(new Request("https://tutribu.example.invalid/api/maintenance", { headers: { authorization: `Bearer ${secret}` } }), () => currentSecret);
      let transactions = 0, sends = 0;
      const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async () => {
        expect(transactions).toBe(0);
        sends += 1;
        return Response.json({ message: { id: randomUUID(), direction: "outbound", channel: "email", status: "queued" } });
      } }]);
      const diagnostics: MessagingDispatchDiagnostic[] = [], deferred: Promise<void>[] = [];
      const worker = buildMessagingWorkModule({
        execute: async (actorUserId, run) => { transactions += 1; try { return await database.withContext({ userId: actorUserId, email: null }, run); } finally { transactions -= 1; } },
        authorize, readSecurityConfig: async () => fixture.config,
        createSender: (preparation) => new ZavuMessageDeliverySender(preparation, transport.fetch),
        createNotificationSender: (preparation) => new ZavuNotificationDeliverySender(preparation, transport.fetch),
        runtime: { now: Date.now, createId: randomUUID, report: (diagnostic) => diagnostics.push(diagnostic), defer: (work) => { deferred.push(work); } },
      });
      expect(await worker.useCases.dispatch.execute()).toMatchObject({ accepted: 1, unresolved: 0 });
      await Promise.all(deferred);
      expect(sends).toBe(1);
      expect(diagnostics).toEqual([]);
      await database.withContext(fixture.own, async (transaction) => {
        const runs = (await transaction.execute<{ outcome: string; counters: { accepted: number; delivered: number }; tribe_id: string }>(sql`select outcome,counters,tribe_id from public.messaging_dispatch_runs`)).rows;
        expect(runs).toEqual([{ outcome: "completed", tribe_id: fixture.scope.tribeId, counters: { claimed: 1, authorized: 1, accepted: 1, delivered: 0, rejected: 0, unknown: 0, suppressed: 0, quotaDeferred: 0, unresolved: 0, deadlineReached: false } }]);
        const phases = (await transaction.execute<{ phase: string }>(sql`select distinct phase from public.messaging_dispatch_phase_samples where tribe_id=${fixture.scope.tribeId}`)).rows;
        expect(new Set(phases.map((sample) => sample.phase))).toEqual(new Set(["claim", "authorize", "prepare", "send", "complete"]));
      });
      currentSecret = undefined;
      await expect(worker.ports.deliveries.claim({ leaseToken: randomUUID(), limit: 1, leaseSeconds: 90 })).rejects.toMatchObject({ code: "permission_denied" });
      expect(sends).toBe(1);
    });
  }, 180_000);

  it("should preserve authentication_required when the actual session expires between usage resolution and its executor", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database);
      await database.applyMigration("20261005095000_guard_global_identity_context.sql");
      const sessionId = randomUUID();
      await database.withContext(fixture.own, (transaction) => transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${fixture.userId},${randomUUID()},clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp())`));
      let identityReads = 0;
      const accounts = new PostgresAuthenticatedAccountProvider(async () => {
        identityReads += 1;
        if (identityReads === 5) await database.withContext(fixture.own, (transaction) => transaction.execute(sql`update public.session set "expiresAt"=clock_timestamp()-interval '1 second' where id=${sessionId}`));
        return { userId: fixture.userId, sessionId };
      }, (identity, run) => database.withContext({ userId: identity.userId, email: fixture.own.email }, run));
      const messaging = buildMessagingModule({ accounts, clock: () => new Date(), execute: (account, run) => database.withContext({ userId: account.userId, email: account.normalizedEmail }, run) }).createRequestModule({ selection: "selected", readSecurityConfig: async () => fixture.config });
      expect(await messaging.useCases.manageUsage.read({ tribeId: fixture.scope.tribeId, requestId: randomUUID() })).toMatchObject({ ok: false, failure: { code: "authentication_required" } });
      expect(identityReads).toBe(5);
    });
  }, 180_000);
});
