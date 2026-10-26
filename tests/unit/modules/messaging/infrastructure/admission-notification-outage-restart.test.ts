/** @vitest-environment node */
/** Exercises durable admission notification uncertainty with native SQL and the real SDK behind a closed outage transport. @module admission-notification-outage-restart-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationGroupAuthority } from "@/tests/support/admission-notification-group-authority-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { buildMessagingWorkModule } from "@/src/modules/messaging/setup";
import { createRegisteredMessagingAdapters } from "@/src/modules/messaging/infrastructure/composition/messaging-provider-adapters";
import { ZAVU_DELIVERY_ENDPOINT } from "@/src/modules/messaging/constants/zavu-delivery";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission notification outage and processor restart", () => {
  it("should preserve committed requests and obligations without another POST when a fresh processor observes an original 503 uncertainty", async ({ task }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given one real complete group whose admission sources already committed independently.
      const fixture = await prepareAdmissionNotificationGroupAuthority(database);
      const [group] = await fixture.queueIndividual(1);
      if (!group) throw new Error("Admission notification outage fixture did not queue its selected original");
      /** @returns Only durable source identities and states; private content and credential material stay unread. */
      const readSources = () => fixture.preparationExecute(async (transaction) => ({
        requests: (await transaction.execute(sql`select id,status,version from public.academy_admission_requests where tribe_id=${fixture.tribeId} order by id`)).rows,
        obligations: (await transaction.execute(sql`select id,event_type from public.academy_admission_notification_obligations where tribe_id=${fixture.tribeId} order by id`)).rows,
      }));
      const originalSources = await readSources();
      expect(originalSources.requests.length).toBeGreaterThan(0);
      expect(originalSources.obligations.length).toBeGreaterThan(0);
      /** @returns The original idempotency, group and bounded retry deadline, without the signed email or ciphertext. */
      const readOriginal = () => fixture.preparationExecute(async (transaction) => (await transaction.execute<{ id: string; notification_group_id: string; idempotency_key: string; deadline_at: string; within_retry_window: boolean }>(sql`select id,notification_group_id,idempotency_key,deadline_at::text,deadline_at <= created_at + interval '24 hours' as within_retry_window from public.message_deliveries where id=${group.deliveryId} and tribe_id=${fixture.tribeId}`)).rows[0]);
      const original = await readOriginal();
      expect(original?.within_retry_window).toBe(true);
      const upstreamPrivateMessage = `synthetic-outage-${randomUUID()}`;
      const transport = createAdmissionProviderTransport([{ origin: ZAVU_DELIVERY_ENDPOINT.origin, pathname: ZAVU_DELIVERY_ENDPOINT.path, method: "POST", respond: () => Response.json({ error: upstreamPrivateMessage }, { status: 503 }) }]);
      const deferred: Promise<void>[] = [];
      const diagnostics: { stage: string; causeName: string | null; code: string | null }[] = [];
      Object.assign(task.meta, { nativeOutageDiagnostics: diagnostics });
      /** Creates new repositories, private adapters and a real SDK factory over the same durable original. @returns A fresh processor without an in-memory prior delivery result. */
      const createWorker = () => {
        const adapters = createRegisteredMessagingAdapters({
          execute: (context, run) => fixture.deliveryExecute(context.authorizationPurpose === MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery ? context.contributingLeaderUserId : context.actorUserId, run),
          readSecurityFacts: async () => ({ environment: fixture.keys.config.environment, securityEpoch: fixture.keys.config.securityEpoch, recoveryLocked: false }),
          authorizeDeliveryResource: fixture.guards.marked,
          fetch: transport.fetch,
        });
        return buildMessagingWorkModule({ execute: fixture.deliveryExecute, authorize: async () => true, readSecurityConfig: fixture.readSecurityConfig, createSender: adapters.createSender, createNotificationSender: adapters.createNotificationSender, runtime: { now: Date.now, createId: randomUUID, defer: (work) => { deferred.push(work); }, report: (diagnostic) => {
          const cause = diagnostic.cause;
          diagnostics.push({ stage: diagnostic.stage, causeName: cause instanceof Error ? cause.name : null, code: typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string" ? cause.code : null });
        } } });
      };

      // When the actual SDK receives 503 after its native marker, uncertainty is persisted once.
      const failed = await createWorker().useCases.dispatch.execute();
      for (let index = 0; index < deferred.length; index += 1) await deferred[index];
      expect(failed).toMatchObject({ claimed: 1, authorized: 1, accepted: 0, unknown: 1, unresolved: 0 });
      expect(JSON.stringify(failed)).not.toContain(upstreamPrivateMessage);
      expect(transport.receipts).toHaveLength(1);
      expect(await fixture.snapshot(group.deliveryId)).toMatchObject({ state: "unknown", attempts: 1, reservations: 1 });
      expect(await readSources()).toEqual(originalSources);
      expect(await readOriginal()).toEqual(original);

      // Then a newly composed processor preserves the original and cannot grant a blind retry.
      const restarted = await createWorker().useCases.dispatch.execute();
      for (let index = 0; index < deferred.length; index += 1) await deferred[index];
      expect(restarted).toMatchObject({ claimed: 0, accepted: 0, unknown: 0, unresolved: 0 });
      expect(transport.receipts).toHaveLength(1);
      expect(transport.deniedRequests).toBe(0);
      const persisted = await fixture.snapshot(group.deliveryId);
      expect(persisted).toMatchObject({ state: "unknown", attempts: 1, reservations: 1 });
      expect(await readSources()).toEqual(originalSources);
      expect(await readOriginal()).toEqual(original);
      Object.assign(task.meta, { nativeNotificationOutage: { first: failed, restarted, persisted, transport: transport.receipts, originalSourcesPreserved: true, originalDeadlinePreserved: true, realMessages: 0 } });
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);
});
