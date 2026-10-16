/** @vitest-environment node */
/** Exercises native group/marker/secret preparation and the real registered SDK behind a closed transport. @module admission-notification-delivery-preparation-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationGroupAuthority } from "@/tests/support/admission-notification-group-authority-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { createRegisteredMessagingAdapters } from "@/src/modules/messaging/infrastructure/composition/messaging-provider-adapters";
import { buildAdmissionNotificationDeliveryModule } from "@/src/modules/notifications/setup";
import { PostgresAdmissionNotificationDeliveryPreparation } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-delivery-preparation";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native prepared admission notification delivery", () => {
  it("should send the complete original email only after committed native preparation, without holding its delivery lock during the SDK request", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupAuthority(database);
      await fixture.queueIndividual(2);
      const claim = await fixture.claim(), authorized = await fixture.deliveryRepository.authorize(claim, randomUUID());
      if (authorized.outcome !== "authorized") throw new Error("Native notification sender fixture did not obtain its original committed marker");
      const context = authorized.context;
      const original = await fixture.execute(async (transaction) => (await transaction.execute<{ sender: string; subject: string; text: string; idempotency: string; deadline: string }>(sql`select frozen_intent->>'senderId' as sender,frozen_intent->>'subject' as subject,frozen_intent->>'text' as text,idempotency_key as idempotency,(extract(epoch from deadline_at)*${MICROSECONDS_PER_SECOND})::bigint::text as deadline from public.message_deliveries where id=${context.deliveryId}`)).rows[0]);
      const messageId = randomUUID();
      const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
        // A separate actual transaction can take this lock only after preparation has released its native transaction.
        const locked = await fixture.deliveryExecute(context.contributingLeaderUserId, (transaction) => transaction.execute(sql`select id from public.message_deliveries where id=${context.deliveryId} for update nowait`));
        expect(locked.rows).toEqual([{ id: context.deliveryId }]);
        expect(request.headers.get("Zavu-Sender")).toBe(original.sender);
        const authorization = request.headers.get("Authorization");
        expect(typeof authorization === "string" && authorization.startsWith("Bearer ") && authorization.length > "Bearer ".length).toBe(true);
        const body = await request.json() as Record<string, unknown>;
        expect(body).toMatchObject({ to: `${fixture.leaderId}@gmail.com`, channel: "email", messageType: "text", subject: original.subject, text: original.text, fallbackEnabled: false, idempotencyKey: original.idempotency });
        expect(body).not.toHaveProperty("code");
        expect(body).not.toHaveProperty("content");
        return Response.json({ message: { id: messageId, direction: "outbound", channel: "email", status: "queued" } });
      } }]);
      const adapters = createRegisteredMessagingAdapters({ execute: (scope, run) => fixture.deliveryExecute(scope.authorizationPurpose === "authorized_delivery" ? scope.contributingLeaderUserId : scope.actorUserId, run), readSecurityFacts: async () => ({ environment: fixture.keys.config.environment, securityEpoch: fixture.keys.config.securityEpoch, recoveryLocked: fixture.keys.config.recoveryLocked }), authorizeDeliveryResource: fixture.guards.marked, fetch: transport.fetch });
      let jobAllowed = false;
      const deliveryModule = buildAdmissionNotificationDeliveryModule({ execute: fixture.deliveryExecute, authorize: async () => jobAllowed, readSecurityConfig: fixture.readSecurityConfig, createSender: adapters.createNotificationSender });
      await expect(deliveryModule.sender.prepare(context, new AbortController().signal)).rejects.toMatchObject({ code: "permission_denied" });
      expect(await fixture.snapshot(context.deliveryId)).toMatchObject({ attempts: 1, reservations: 1, exposures: 0 });
      jobAllowed = true;
      const operation = await deliveryModule.sender.prepare(context, new AbortController().signal);
      expect(transport.receipts).toHaveLength(0);
      expect(await fixture.snapshot(context.deliveryId)).toMatchObject({ state: "queued", attempts: 1, reservations: 1, exposures: 1 });
      const receipt = await operation.send(new AbortController().signal);
      expect(receipt).toEqual({ outcome: "accepted", providerMessageId: messageId, correlationId: null, reason: "provider_accepted" });
      const completed = await fixture.deliveryRepository.complete({ context, ...receipt });
      expect(completed.outcome).not.toBe("stale");
      expect(await fixture.snapshot(context.deliveryId)).toMatchObject({ state: "accepted", attempts: 1, reservations: 1, exposures: 1 });
      expect(await fixture.execute(async (transaction) => (await transaction.execute(sql`select category,state from public.messaging_usage_reservations where delivery_id=${context.deliveryId}`)).rows)).toEqual([{ category: "notification", state: "consumed" }]);
      expect(await fixture.execute(async (transaction) => (await transaction.execute(sql`select idempotency_key as idempotency,(extract(epoch from deadline_at)*${MICROSECONDS_PER_SECOND})::bigint::text as deadline from public.message_deliveries where id=${context.deliveryId}`)).rows)).toEqual([{ idempotency: original.idempotency, deadline: original.deadline }]);

      const nextClaim = await fixture.claim(), nextAuthorization = await fixture.deliveryRepository.authorize(nextClaim, randomUUID());
      if (nextAuthorization.outcome !== "authorized") throw new Error("Native notification sender did not obtain the second original marker");
      const nextContext = nextAuthorization.context, before = (await fixture.snapshot(nextContext.deliveryId)).exposures;
      const revokedJob = buildAdmissionNotificationDeliveryModule({ execute: fixture.deliveryExecute, authorize: async () => (await fixture.snapshot(nextContext.deliveryId)).exposures === before, readSecurityConfig: fixture.readSecurityConfig, createSender: adapters.createNotificationSender });
      await expect(revokedJob.sender.prepare(nextContext, new AbortController().signal)).rejects.toMatchObject({ code: "permission_denied" });
      expect(await fixture.snapshot(nextContext.deliveryId)).toMatchObject({ state: "queued", attempts: 1, reservations: 1, exposures: before + 1 });
      expect(transport.receipts).toHaveLength(1);
      expect(transport.deniedRequests).toBe(0);
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);

  it("should close after a real secret read if the original recipient opts out and preserve the original marker and consumed notification budget", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupAuthority(database);
      await fixture.queueIndividual(1);
      const claim = await fixture.claim(), authorized = await fixture.deliveryRepository.authorize(claim, randomUUID());
      if (authorized.outcome !== "authorized") throw new Error("Native notification preparation did not obtain its original marker");
      let secretRead = false;
      const preparation = new PostgresAdmissionNotificationDeliveryPreparation(fixture.deliveryExecute, { loadAuthorizedSecret: async (context) => {
        const credential = await fixture.secrets.loadAuthorizedSecret(context);
        secretRead = true;
        await fixture.execute((transaction) => transaction.execute(sql`update public.admission_notification_preferences set mode='omitted',version=version+1 where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.leaderId}`));
        return credential;
      } }, fixture.readSecurityConfig);
      const transport = createAdmissionProviderTransport([]);
      const adapters = createRegisteredMessagingAdapters({ execute: (scope, run) => fixture.deliveryExecute(scope.authorizationPurpose === "authorized_delivery" ? scope.contributingLeaderUserId : scope.actorUserId, run), readSecurityFacts: async () => ({ environment: fixture.keys.config.environment, securityEpoch: fixture.keys.config.securityEpoch, recoveryLocked: false }), authorizeDeliveryResource: fixture.guards.marked, fetch: transport.fetch });
      await expect(adapters.createNotificationSender(preparation).prepare(authorized.context, new AbortController().signal)).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(secretRead).toBe(true);
      expect(await fixture.snapshot(authorized.context.deliveryId)).toEqual({ state: "queued", attempts: 1, reservations: 1, exposures: 1, suppressions: 0 });
      expect(transport.receipts).toHaveLength(0);
      expect(transport.deniedRequests).toBe(0);
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);
});
