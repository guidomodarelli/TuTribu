/** @vitest-environment node */
/** Exercises genuine marker expiry during the last valid local configuration read. @module admission-notification-preparation-final-lifetime-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { MILLISECONDS_PER_SECOND } from "@/src/constants/time";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationGroupAuthority } from "@/tests/support/admission-notification-group-authority-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS, ADMISSION_NOTIFICATION_MARKER_EXPIRY_TEST_HEADROOM_MS } from "@/tests/support/constants/admission-notification-validation";
import { createRegisteredMessagingAdapters } from "@/src/modules/messaging/infrastructure/composition/messaging-provider-adapters";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { ZAVU_DELIVERY_ENDPOINT } from "@/src/modules/messaging/constants/zavu-delivery";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { PostgresAdmissionNotificationDeliveryPreparation } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-delivery-preparation";
import { IDLE_IN_TRANSACTION_TIMEOUT_MILLISECONDS } from "@/src/modules/shared/infrastructure/database/postgres-pool";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native final notification marker lifetime", () => {
  it("should reject a marker that genuinely expires during the final valid snapshot before any provider request", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupAuthority(database);
      await fixture.queueIndividual(2);
      const authorization = await fixture.deliveryRepository.authorize(await fixture.claim(), randomUUID());
      if (authorization.outcome !== "authorized") throw new Error("Final notification lifetime fixture did not obtain its original committed marker");
      const healthyContext = authorization.context;
      /** @param deliveryId - Original native marker. @returns Its remaining lifetime in native milliseconds without retaining a checkout. */
      const readRemainingLeaseMs = (deliveryId: string) => fixture.execute(async (transaction) => Number((await transaction.execute<{ remaining: string }>(sql`select (extract(epoch from (lease_until-clock_timestamp()))*${MILLISECONDS_PER_SECOND})::bigint::text as remaining from public.message_deliveries where id=${deliveryId}`)).rows[0].remaining));
      let secretRead = false, snapshotsAfterSecret = 0, pauseAtSnapshot: number | null = null, pauseDeadline = 0, finalSnapshotPaused = false;
      const preparation = new PostgresAdmissionNotificationDeliveryPreparation(fixture.deliveryExecute, { loadAuthorizedSecretMaterial: async (scope) => {
        const material = await fixture.secrets.loadAuthorizedSecretMaterial(scope);
        secretRead = true;
        if (pauseAtSnapshot !== null && scope.authorizationPurpose === MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery) {
          // Age the genuine marker only after the secret transaction has released all its locks.
          const remainingLeaseMs = await readRemainingLeaseMs(scope.deliveryId);
          const finalWindowMs = IDLE_IN_TRANSACTION_TIMEOUT_MILLISECONDS - ADMISSION_NOTIFICATION_MARKER_EXPIRY_TEST_HEADROOM_MS;
          await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, remainingLeaseMs - finalWindowMs)));
        }
        return material;
      } }, async () => {
        if (secretRead) {
          snapshotsAfterSecret += 1;
          if (snapshotsAfterSecret === pauseAtSnapshot) {
            finalSnapshotPaused = true;
            // Wait with locks unchanged, without a nested checkout or altering native persisted times.
            await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, pauseDeadline - performance.now())));
          }
        }
        return fixture.keys.config;
      });
      const transport = createAdmissionProviderTransport([{ origin: ZAVU_DELIVERY_ENDPOINT.origin, pathname: ZAVU_DELIVERY_ENDPOINT.path, method: "POST", respond: () => Response.json({ message: { id: randomUUID(), direction: "outbound", channel: "email", status: "queued" } }) }]);
      const adapters = createRegisteredMessagingAdapters({ execute: (scope, run) => fixture.deliveryExecute(scope.authorizationPurpose === MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery ? scope.contributingLeaderUserId : scope.actorUserId, run), readSecurityFacts: async () => ({ environment: fixture.keys.config.environment, securityEpoch: fixture.keys.config.securityEpoch, recoveryLocked: false }), authorizeDeliveryResource: fixture.guards.marked, fetch: transport.fetch });
      const signal = new AbortController().signal;
      const healthy = await adapters.createNotificationSender(preparation).prepare(healthyContext, signal);
      expect(snapshotsAfterSecret).toBeGreaterThan(0);
      const healthyReceipt = await healthy.send(signal);
      expect(healthyReceipt.outcome).toBe("accepted");
      expect((await fixture.deliveryRepository.complete({ context: healthyContext, ...healthyReceipt })).outcome).not.toBe("stale");
      const nextAuthorization = await fixture.deliveryRepository.authorize(await fixture.claim(), randomUUID());
      if (nextAuthorization.outcome !== "authorized") throw new Error("Final lifetime fixture did not obtain a fresh original fault marker");
      const context = nextAuthorization.context, requestsBeforeFault = transport.receipts.length;
      pauseAtSnapshot = snapshotsAfterSecret;
      snapshotsAfterSecret = 0;
      secretRead = false;
      const remainingLeaseMs = await readRemainingLeaseMs(context.deliveryId);
      expect(remainingLeaseMs).toBeGreaterThan(0);
      pauseDeadline = performance.now() + remainingLeaseMs + MILLISECONDS_PER_SECOND;
      const outcome = await adapters.createNotificationSender(preparation).prepare(context, signal).then((operation) => operation.send(signal)).then(() => ({ status: "fulfilled", code: null }), (error: unknown) => ({ status: "rejected", code: error instanceof MessagingSecretAccessError ? error.code : "unclassified" }));
      const expired = await fixture.execute(async (transaction) => (await transaction.execute<{ expired: boolean }>(sql`select lease_until<=clock_timestamp() as expired from public.message_deliveries where id=${context.deliveryId}`)).rows[0].expired);
      expect(finalSnapshotPaused).toBe(true);
      expect(expired).toBe(true);
      expect(JSON.stringify({ ...outcome, providerRequests: transport.receipts.length - requestsBeforeFault })).toBe(JSON.stringify({ status: "rejected", code: MESSAGING_ERROR_CODE.resourceUnavailable, providerRequests: 0 }));
      expect(await fixture.snapshot(context.deliveryId)).toEqual({ state: "queued", attempts: 1, reservations: 1, exposures: 2, suppressions: 0 });
      expect(transport.deniedRequests).toBe(0);
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);
});
