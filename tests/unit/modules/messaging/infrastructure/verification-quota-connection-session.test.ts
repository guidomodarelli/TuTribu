/** @vitest-environment node */
/** Exercises consumed verification capacity through real connection replacement and a second native session. @module verification-quota-connection-session-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingConnectionActivation } from "@/tests/support/messaging-activation-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { MESSAGING_QUOTA_CONTINUITY_VALIDATION_TIMEOUT_MS } from "@/tests/support/constants/messaging-quota-continuity";
import { PostgresAuthenticatedAccountProvider } from "@/src/modules/auth/infrastructure/authenticated-account-provider";
import { ScopedConnectionDiagnosticDispatcher } from "@/src/modules/messaging/infrastructure/composition/connection-diagnostic-dispatcher";
import { buildMessagingModule, buildMessagingWorkModule } from "@/src/modules/messaging/setup";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import type { MessageDispatchRunResult } from "@/src/modules/messaging/application/results/message-dispatch-result";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native consumed quota connection and session continuity", () => {
  it("should retain consumed verification reservations after real replacement and deny another diagnostic from a second native session", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Arrange: prepare and activate the first connection through its actual diagnostic and owner.
      const first = await prepareMessagingConnectionActivation(database);
      process.stdout.write(JSON.stringify({ phase: "first_candidate_prepared" }) + "\n");
      const activated = await first.owner.activate(first.context, first.input);
      expect(activated).toMatchObject({ state: "completed", result: { state: "active" } });
      process.stdout.write(JSON.stringify({ phase: "first_connection_activated" }) + "\n");
      const replacement = await prepareMessagingConnectionActivation(database, first.fixture, `${randomUUID()}@example.test`);
      process.stdout.write(JSON.stringify({ phase: "replacement_candidate_prepared" }) + "\n");
      const own = first.fixture.fixture.own, tribeId = first.context.tribeId;
      const consumed = await database.withContext(own, async (transaction) => (await transaction.execute<{ id: string; attempt_id: string; delivery_id: string; connection_id: string; reserved_at: Date | string; state: string; category: string }>(sql`select reservation.id,reservation.attempt_id,reservation.delivery_id,delivery.connection_id,reservation.reserved_at,reservation.state,reservation.category from public.messaging_usage_reservations reservation join public.message_deliveries delivery on delivery.id=reservation.delivery_id where reservation.tribe_id=${tribeId} order by reservation.id`)).rows);
      expect(consumed).toHaveLength(2);
      expect(consumed.every((reservation) => reservation.state === "consumed" && reservation.category === "verification")).toBe(true);
      await database.withContext(own, (transaction) => transaction.execute(sql`update public.messaging_usage_policies set verification_daily_limit=${consumed.length},version=version+1 where tribe_id=${tribeId}`));
      const policyBefore = await database.withContext(own, async (transaction) => (await transaction.execute(sql`select version,verification_daily_limit,notification_daily_limit from public.messaging_usage_policies where tribe_id=${tribeId}`)).rows[0]);
      const replaced = await replacement.owner.activate(replacement.context, replacement.input);
      expect(replaced).toMatchObject({ state: "completed", result: { state: "active", replaced: { connectionId: first.context.connectionId, connectionVersion: first.context.connectionVersion } } });
      if (replaced.state !== "completed") throw new Error("Quota continuity expected the native replacement commit");
      process.stdout.write(JSON.stringify({ phase: "replacement_committed" }) + "\n");

      // Act: establish another real session of the same account bound to Google.
      const sessionId = randomUUID(), sessionToken = randomUUID();
      await database.withContext(own, async (transaction) => {
        const now = new Date((await transaction.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`)).rows[0].now);
        const expiresAt = new Date(now.getTime() + 3_600_000);
        await transaction.execute(sql`insert into public.session(id,"userId",token,"expiresAt","createdAt","updatedAt") values (${sessionId},${own.userId},${sessionToken},${expiresAt},${now},${now})`);
        await transaction.execute(sql`insert into public.global_session_identity_bindings(session_id,user_id,account_id,provider_subject,normalized_email) values (${sessionId},${own.userId},${replacement.context.accountId},${replacement.context.subject},${own.email})`);
      });
      const accounts = new PostgresAuthenticatedAccountProvider(async () => ({ userId: own.userId, sessionId }), (_identity, run) => database.withContext(own, run));
      expect(await accounts.getAuthenticatedAccount()).toMatchObject({ userId: own.userId, session: { id: sessionId } });
      process.stdout.write(JSON.stringify({ phase: "second_session_authenticated" }) + "\n");
      const messaging = buildMessagingModule({ accounts, execute: (_account, run) => database.withContext(own, run), clock: () => new Date() });
      const request = messaging.createRequestModule({ selection: "management", readSecurityConfig: async () => first.fixture.fixture.config });
      const transport = createAdmissionProviderTransport([]), deferred: Promise<void>[] = [], runs: MessageDispatchRunResult[] = [], diagnostics: string[] = [];
      let preparations = 0;
      const dispatcher = new ScopedConnectionDiagnosticDispatcher({ readSecurityFacts: async () => first.fixture.fixture.config, createDispatcher: (diagnosticScope, authorize) => {
        const worker = buildMessagingWorkModule({ diagnosticScope, authorize, execute: (actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run), readSecurityConfig: async () => first.fixture.fixture.config, createSender: (preparation) => {
          const sender = new ZavuMessageDeliverySender(preparation, transport.fetch);
          return { prepare: async (context, signal) => { preparations += 1; return sender.prepare(context, signal); } };
        }, runtime: { now: Date.now, createId: randomUUID, defer: (work) => { deferred.push(work); }, report: () => { diagnostics.push("dispatch_failed"); } } }).useCases.dispatch;
        return { execute: async () => { const result = await worker.execute(); runs.push(result); return result; } };
      } });
      const issued = await request.createDiagnosticIssuance(dispatcher).execute({ tribeId, connectionId: replacement.context.connectionId, requestId: randomUUID(), operationId: randomUUID(), expectedVersion: replaced.result.version, confirmed: true, channel: "email", recipient: `${randomUUID()}@example.test` });
      expect(issued).toMatchObject({ ok: true, value: { state: "completed", result: { outcome: "issued" } } });
      await Promise.all(deferred);
      process.stdout.write(JSON.stringify({ phase: "second_session_dispatch_complete" }) + "\n");

      // Assert: current authority/session reached the marker, but replacement cannot reset paid consumption.
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ claimed: 1, authorized: 0, quotaDeferred: 1, accepted: 0, suppressed: 0, unresolved: 0 });
      expect(preparations).toBe(0);
      expect(transport.receipts).toEqual([]);
      expect(transport.deniedRequests).toBe(0);
      expect(diagnostics).toEqual([]);
      await database.withContext(own, async (transaction) => {
        expect((await transaction.execute(sql`select reservation.id,reservation.attempt_id,reservation.delivery_id,delivery.connection_id,reservation.reserved_at,reservation.state,reservation.category from public.messaging_usage_reservations reservation join public.message_deliveries delivery on delivery.id=reservation.delivery_id where reservation.tribe_id=${tribeId} order by reservation.id`)).rows).toEqual(consumed);
        expect((await transaction.execute(sql`select version,verification_daily_limit,notification_daily_limit from public.messaging_usage_policies where tribe_id=${tribeId}`)).rows[0]).toEqual(policyBefore);
        expect((await transaction.execute(sql`select id,state from public.tenant_messaging_connections where tribe_id=${tribeId} and is_selected`)).rows).toEqual([{ id: replacement.context.connectionId, state: "active" }]);
      });
    });
  }, MESSAGING_QUOTA_CONTINUITY_VALIDATION_TIMEOUT_MS);
});
