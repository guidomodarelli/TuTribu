/** @vitest-environment node */
/** Exercises isolation and live PostgreSQL authority changes through the protected delivery pipeline. @module messaging-isolation-and-rotation-tests */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareVerificationDeliveryPipeline } from "@/tests/support/verification-delivery-pipeline-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { PostgresMessageDeliveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-repository";
import { PostgresVerificationDeliveryPreparation } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-delivery-preparation";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import { DispatchMessageDeliveriesUseCase } from "@/src/modules/messaging/application/use-cases/dispatch-message-deliveries-use-case";
import { createMessagingDispatchConfig } from "@/src/modules/messaging/infrastructure/config/messaging-dispatch-config";
import { MESSAGE_STORAGE_OPERATION } from "@/src/modules/messaging/constants/message-delivery";
import type { MessagingDispatchDiagnostic } from "@/src/modules/messaging/domain/repositories/message-delivery-sender";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("messaging isolation and rotation", () => {
  it("should keep interleaved tenant credentials, senders, original resource versions and charged receipts isolated through SQL, SecretStore and SDK", async () => {
    await withAcademyAdmissionDatabase(async (firstDatabase) => {
      const first = await prepareVerificationDeliveryPipeline(firstDatabase, randomUUID());
      await withAcademyAdmissionDatabase(async (secondDatabase) => {
        const second = await prepareVerificationDeliveryPipeline(secondDatabase, randomUUID());
        const firstClaim = (await first.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 300 }))[0];
        const secondClaim = (await second.repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 300 }))[0];
        const firstAuthorized = await first.repository.authorize(firstClaim, randomUUID()), secondAuthorized = await second.repository.authorize(secondClaim, randomUUID());
        if (firstAuthorized.outcome !== "authorized" || secondAuthorized.outcome !== "authorized") throw new Error("Expected two protected committed markers");
        const stillFirst = await first.snapshot();
        expect(stillFirst.attempts).toEqual([{ id: firstAuthorized.context.attemptId, state: "in_flight", connection_id: first.scope.connectionId, connection_version: first.scope.connectionVersion, provider_message_id: null }]);
        expect(stillFirst.reservations).toEqual([{ delivery_id: first.original.deliveryId, attempt_id: firstAuthorized.context.attemptId, state: "consumed" }]);
        const firstEntered = Promise.withResolvers<void>(), releaseFirst = Promise.withResolvers<void>();
        const firstProviderId = randomUUID(), secondProviderId = randomUUID(), observed: string[] = [];
        const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
          const senderId = request.headers.get("Zavu-Sender"), fixture = senderId === first.emailSenderId ? first : senderId === second.emailSenderId ? second : null;
          if (!fixture) throw new Error("Expected the original synthetic tenant sender");
          expect(fixture.transactions).toBe(0);
          expect(request.headers.get("Authorization") === `Bearer ${fixture.credential}`).toBe(true);
          expect(request.headers.get("Cookie")).toBeNull();
          const body = await request.json() as { to: string; channel: string; fallbackEnabled: boolean; idempotencyKey: string };
          expect(body.channel).toBe("email"); expect(body.fallbackEnabled).toBe(false);
          expect(body.to === fixture.scope.contact.value).toBe(true);
          expect(body.idempotencyKey).toBeTruthy();
          observed.push(fixture.scope.tribeId);
          if (fixture === first) { firstEntered.resolve(); await releaseFirst.promise; }
          return Response.json({ message: { id: fixture === first ? firstProviderId : secondProviderId, direction: "outbound", channel: "email", status: "sent" } });
        } }]);
        const firstController = new AbortController(), secondController = new AbortController();
        const firstPrepared = await new ZavuMessageDeliverySender(first.preparation, transport.fetch).prepare(firstAuthorized.context, firstController.signal);
        const secondPrepared = await new ZavuMessageDeliverySender(second.preparation, transport.fetch).prepare(secondAuthorized.context, secondController.signal);
        const firstPending = firstPrepared.send(firstController.signal);
        let firstReceipt, secondReceipt;
        try {
          await firstEntered.promise;
          secondReceipt = await secondPrepared.send(secondController.signal);
          expect(secondReceipt).toMatchObject({ outcome: "accepted", providerMessageId: secondProviderId });
          releaseFirst.resolve(); firstReceipt = await firstPending;
        } finally { releaseFirst.resolve(); firstController.abort(); await firstPending.catch(() => undefined); }
        expect(firstReceipt).toMatchObject({ outcome: "accepted", providerMessageId: firstProviderId });
        expect(await second.repository.complete({ context: secondAuthorized.context, ...secondReceipt })).toMatchObject({ outcome: "completed" });
        expect(await first.repository.complete({ context: firstAuthorized.context, ...firstReceipt })).toMatchObject({ outcome: "completed" });
        expect(observed).toEqual([first.scope.tribeId, second.scope.tribeId]); expect(transport.receipts).toHaveLength(2);
        for (const [fixture, authorization, providerId] of [[first, firstAuthorized, firstProviderId], [second, secondAuthorized, secondProviderId]] as const) {
          const snapshot = await fixture.snapshot();
          expect(snapshot.delivery).toMatchObject({ id: fixture.original.deliveryId, state: "accepted", connection_id: fixture.scope.connectionId, connection_version: fixture.scope.connectionVersion });
          expect(snapshot.attempts).toEqual([{ id: authorization.context.attemptId, state: "accepted", connection_id: fixture.scope.connectionId, connection_version: fixture.scope.connectionVersion, provider_message_id: providerId }]);
          expect(snapshot.reservations).toEqual([{ delivery_id: fixture.original.deliveryId, attempt_id: authorization.context.attemptId, state: "consumed" }]);
        }
      });
    });
  }, 900_000);
  it("should reject a channel revoked during an observed PostgreSQL fence wait before any credential or SDK access", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareVerificationDeliveryPipeline(database);
      const held = Promise.withResolvers<number>(), started = Promise.withResolvers<number>(), release = Promise.withResolvers<void>();
      const holding = database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`select id from public.tribes where id=${fixture.scope.tribeId} for update`);
        held.resolve((await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
        await release.promise;
        await transaction.execute(sql`update public.messaging_connection_capabilities set state='unprepared',tested_at=null where tribe_id=${fixture.scope.tribeId} and connection_id=${fixture.scope.connectionId} and connection_version=${fixture.scope.connectionVersion} and channel=${fixture.scope.channel}`);
      });
      const holderPid = await held.promise;
      const repository = new PostgresMessageDeliveryRepository(fixture.execute, async (transaction, operation) => {
        if (operation === MESSAGE_STORAGE_OPERATION.authorize) started.resolve((await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid);
        return true;
      }, async () => fixture.config);
      let credentialReads = 0;
      const secrets = { loadAuthorizedSecret: async (context: Parameters<typeof fixture.secrets.loadAuthorizedSecret>[0]) => { credentialReads += 1; return fixture.secrets.loadAuthorizedSecret(context); } };
      const transport = createAdmissionProviderTransport([]), deferred: Promise<void>[] = [], diagnostics: MessagingDispatchDiagnostic[] = [];
      const preparation = new PostgresVerificationDeliveryPreparation(fixture.execute, secrets, async () => fixture.config);
      const dispatcher = new DispatchMessageDeliveriesUseCase(repository, new ZavuMessageDeliverySender(preparation, transport.fetch), createMessagingDispatchConfig(), { now: Date.now, createId: randomUUID, defer: (work) => { deferred.push(work); }, report: (diagnostic) => { diagnostics.push(diagnostic); } });
      const outcome = dispatcher.execute().then((value) => ({ status: "fulfilled" as const, value }), (error: unknown) => ({ status: "rejected" as const, error }));
      try {
        const readerPid = await started.promise;
        let observed = false;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const blockers = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ blockers: number[] }>(sql`select pg_blocking_pids(${readerPid}) as blockers`)).rows[0].blockers);
          if (blockers.includes(holderPid)) { observed = true; break; }
          await delay(50);
        }
        expect(observed).toBe(true);
      } finally { release.resolve(); await holding; }
      expect(await outcome).toMatchObject({ status: "fulfilled", value: { claimed: 1, authorized: 0, suppressed: 1, accepted: 0, unknown: 0, unresolved: 0 } });
      await Promise.all(deferred);
      expect(credentialReads).toBe(0);
      expect(transport.receipts).toEqual([]);
      expect(diagnostics).toEqual([]);
      expect(await fixture.snapshot()).toMatchObject({ delivery: { state: "suppressed", last_outcome: "capability_unprepared" }, attempts: [], reservations: [] });
    });
  }, 600_000);
});
