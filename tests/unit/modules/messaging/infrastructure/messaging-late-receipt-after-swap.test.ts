/** @vitest-environment node */
/** Exercises a confirmed replacement while the original real-SDK call is pending, without redirecting late evidence. @module messaging-late-receipt-after-swap-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareMessagingConnectionActivation, refreshMessagingActivationRecency } from "@/tests/support/messaging-activation-fixture";
import { advanceVerificationRequestCooldown, contactVerificationIssuanceSnapshotSchema } from "@/tests/support/contact-verification-issuance-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { PostgresAdmissionOperationRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-operation-repository";
import { PostgresContactVerificationIssuer } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-contact-verification-issuer";
import { PostgresMessagingContactBudgetRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-messaging-contact-budget-repository";
import { PostgresVerificationRequestBudget } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-request-budget";
import { PostgresMessageDeliveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-repository";
import { PostgresEncryptedSecretStore } from "@/src/modules/messaging/infrastructure/repositories/postgres-encrypted-secret-store";
import { PostgresVerificationDeliveryPreparation } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-delivery-preparation";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { VERIFICATION_ISSUANCE_OPERATION } from "@/src/modules/academy-admissions/constants/verification-issuance";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("late receipt after actual selection swap", () => {
  it("should persist a late original SDK response only on its old charged attempt after the native owner confirms a new selection", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const previous = await prepareMessagingConnectionActivation(database);
      expect(await previous.owner.activate(previous.context, previous.input)).toMatchObject({ state: "completed", result: { state: "active" } });
      const config = previous.fixture.fixture.config, own = previous.fixture.fixture.own;
      const scope: VerificationChallengeScope = { userId: own.userId, tribeId: previous.context.tribeId, connectionId: previous.context.connectionId, connectionVersion: previous.context.connectionVersion, securityEpoch: config.securityEpoch, purpose: "admission", verificationEpoch: 1, channel: "email", contact: { type: "email", value: own.email } };
      await advanceVerificationRequestCooldown(database, { own, scope });
      const next = await prepareMessagingConnectionActivation(database, previous.fixture, `${randomUUID()}@example.test`);
      await advanceVerificationRequestCooldown(database, { own, scope });
      /** @param transaction - Existing protected transaction. @returns Whether the original native actor remains the sole current leader. */
      const authorize = async (transaction: RequestDatabase) => {
        await transaction.execute(sql`select id from public.tribes where id=${scope.tribeId} for share`);
        return Boolean((await transaction.execute(sql`select id from public.tribe_members where tribe_id=${scope.tribeId} and user_id=${own.userId} and role='leader' and status='active' for share`)).rows[0]);
      };
      const ledger = new PostgresAdmissionOperationRepository((run) => database.withContext(own, run), authorize, async () => config), operationId = randomUUID();
      const issued = await ledger.run({ actorUserId: own.userId, tribeId: scope.tribeId, operationType: VERIFICATION_ISSUANCE_OPERATION.issue, idempotencyKey: operationId, intent: { connectionId: scope.connectionId, connectionVersion: scope.connectionVersion, purpose: scope.purpose, channel: scope.channel, contact: scope.contact.value, expectedCurrentChallengeId: null } }, contactVerificationIssuanceSnapshotSchema, async (transaction, ledgerId) => {
        const contacts = new PostgresMessagingContactBudgetRepository(transaction, async () => true, async () => config), budget = new PostgresVerificationRequestBudget(transaction, async () => true, contacts);
        const result = await new PostgresContactVerificationIssuer(transaction, authorize, async () => config, budget).issue({ scope, operationId, ledgerId, expectedCurrentChallengeId: null });
        return result.outcome === "issued" ? { ...result, expiresAt: result.expiresAt.toISOString(), resendAllowedAt: result.resendAllowedAt.toISOString() } : result;
      });
      if (issued.state !== "completed" || issued.result.outcome !== "issued") throw new Error("Expected real original admission issuance before replacement");
      const original = issued.result;
      /** @param actorUserId - Exact contributing actor or maintenance scope. @param run - Database-only callback. @returns Its committed result. */
      const execute = <Result>(actorUserId: string | null, run: (transaction: RequestDatabase) => Promise<Result>) => database.withContext({ userId: actorUserId, email: null }, run);
      const repository = new PostgresMessageDeliveryRepository(execute, async () => true, async () => config);
      const claim = (await repository.claim({ leaseToken: randomUUID(), limit: 2, leaseSeconds: 300 }))[0], authorized = await repository.authorize(claim, randomUUID());
      if (authorized.outcome !== "authorized" || authorized.context.deliveryId !== original.deliveryId) throw new Error("Expected the original committed worker marker");
      const secrets = new PostgresEncryptedSecretStore(execute, { getAuthenticatedAccount: async () => null }, async () => config, "authorized_delivery"), preparation = new PostgresVerificationDeliveryPreparation(execute, secrets, async () => config);
      const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), providerId = randomUUID(), controller = new AbortController();
      const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
        expect(request.headers.get("Authorization") === `Bearer ${previous.credential}`).toBe(true);
        expect(request.headers.get("Zavu-Sender") === previous.senderId).toBe(true);
        expect(request.headers.get("Cookie")).toBeNull();
        entered.resolve(); await release.promise;
        return Response.json({ message: { id: providerId, direction: "outbound", channel: "email", status: "sent" } });
      } }]);
      const prepared = await new ZavuMessageDeliverySender(preparation, transport.fetch, 240_000).prepare(authorized.context, controller.signal);
      const pending = prepared.send(controller.signal);
      let receipt;
      try {
        await entered.promise;
        await refreshMessagingActivationRecency(database, next.fixture, "activate_messaging_connection", next.context.connectionId);
        const resolution = await next.request.useCases.resolveContext.execute({ tribeId: next.context.tribeId, connectionId: next.context.connectionId, operation: "activate_messaging_connection", requestId: randomUUID() });
        if (!resolution.allowed) throw new Error("Expected current native replacement authority");
        expect(await next.owner.activate(resolution.context, next.input)).toMatchObject({ state: "completed", result: { id: next.context.connectionId, state: "active", replaced: { connectionId: previous.context.connectionId, connectionVersion: previous.context.connectionVersion } } });
        const beforeReceipt = await database.withContext(own, async (transaction) => ({ selected: (await transaction.execute(sql`select id,selected_version from public.tenant_messaging_connections where tribe_id=${scope.tribeId} and is_selected`)).rows[0], attempt: (await transaction.execute(sql`select state,connection_id,connection_version,provider_message_id from public.message_delivery_attempts where id=${authorized.context.attemptId}`)).rows[0], reservation: (await transaction.execute(sql`select state from public.messaging_usage_reservations where attempt_id=${authorized.context.attemptId}`)).rows[0] }));
        expect(beforeReceipt).toEqual({ selected: { id: next.context.connectionId, selected_version: next.context.connectionVersion }, attempt: { state: "in_flight", connection_id: previous.context.connectionId, connection_version: previous.context.connectionVersion, provider_message_id: null }, reservation: { state: "consumed" } });
        release.resolve(); receipt = await pending;
      } finally { release.resolve(); controller.abort(); await pending.catch(() => undefined); }
      expect(receipt).toMatchObject({ outcome: "accepted", providerMessageId: providerId });
      expect(await repository.complete({ context: authorized.context, ...receipt })).toMatchObject({ outcome: "completed" });
      await database.withContext(own, async (transaction) => {
        expect((await transaction.execute(sql`select id,selected_version from public.tenant_messaging_connections where tribe_id=${scope.tribeId} and is_selected`)).rows).toEqual([{ id: next.context.connectionId, selected_version: next.context.connectionVersion }]);
        expect((await transaction.execute(sql`select state,connection_id,connection_version,provider_message_id from public.message_delivery_attempts where id=${authorized.context.attemptId}`)).rows).toEqual([{ state: "accepted", connection_id: previous.context.connectionId, connection_version: previous.context.connectionVersion, provider_message_id: providerId }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where attempt_id=${authorized.context.attemptId}`)).rows).toEqual([{ state: "consumed" }]);
        expect((await transaction.execute(sql`select count(*)::int as count from public.message_delivery_attempts where delivery_id=${original.deliveryId}`)).rows).toEqual([{ count: 1 }]);
        expect((await transaction.execute(sql`select state,is_selected,retired_at from public.tenant_messaging_connections where id=${previous.context.connectionId}`)).rows[0]).toMatchObject({ state: "disconnected", is_selected: false, retired_at: expect.anything() });
      });
      expect(transport.receipts).toHaveLength(1);
    });
  }, 1_500_000);
});
