/** @vitest-environment node */
/** Exercises current native resource and key closure after the last asynchronous preparation boundary. @module admission-notification-preparation-final-snapshot-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationGroupAuthority } from "@/tests/support/admission-notification-group-authority-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { createRegisteredMessagingAdapters } from "@/src/modules/messaging/infrastructure/composition/messaging-provider-adapters";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { ZAVU_DELIVERY_ENDPOINT } from "@/src/modules/messaging/constants/zavu-delivery";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { buildAdmissionNotificationDeliveryModule } from "@/src/modules/notifications/setup";
import { PostgresAdmissionNotificationDeliveryPreparation } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-delivery-preparation";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native final notification preparation snapshot", () => {
  it("should reject an opt-out committed while the final job authorization still returns true before any provider request", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupAuthority(database);
      await fixture.queueIndividual(1);
      const authorization = await fixture.deliveryRepository.authorize(await fixture.claim(), randomUUID());
      if (authorization.outcome !== "authorized") throw new Error("Final notification snapshot fixture did not obtain its original committed marker");
      const context = authorization.context;
      let preferenceChanged = false;
      const transport = createAdmissionProviderTransport([{ origin: ZAVU_DELIVERY_ENDPOINT.origin, pathname: ZAVU_DELIVERY_ENDPOINT.path, method: "POST", respond: () => Response.json({ message: { id: randomUUID(), direction: "outbound", channel: "email", status: "queued" } }) }]);
      const adapters = createRegisteredMessagingAdapters({ execute: (scope, run) => fixture.deliveryExecute(scope.authorizationPurpose === MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery ? scope.contributingLeaderUserId : scope.actorUserId, run), readSecurityFacts: async () => ({ environment: fixture.keys.config.environment, securityEpoch: fixture.keys.config.securityEpoch, recoveryLocked: false }), authorizeDeliveryResource: fixture.guards.marked, fetch: transport.fetch });
      const deliveryModule = buildAdmissionNotificationDeliveryModule({ execute: fixture.deliveryExecute, readSecurityConfig: fixture.readSecurityConfig, createSender: adapters.createNotificationSender, authorize: async () => {
        if (!preferenceChanged && (await fixture.snapshot(context.deliveryId)).exposures > 0) {
          await fixture.execute((transaction) => transaction.execute(sql`update public.admission_notification_preferences set mode='omitted',version=version+1 where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.leaderId}`));
          preferenceChanged = true;
        }
        return true;
      } });
      const signal = new AbortController().signal;
      const outcome = await deliveryModule.sender.prepare(context, signal).then((operation) => operation.send(signal)).then(() => ({ status: "fulfilled", code: null }), (error: unknown) => ({ status: "rejected", code: error instanceof MessagingSecretAccessError ? error.code : "unclassified" }));
      expect({ ...outcome, preferenceChanged, providerRequests: transport.receipts.length }).toEqual({ status: "rejected", code: MESSAGING_ERROR_CODE.resourceUnavailable, preferenceChanged: true, providerRequests: 0 });
      expect(await fixture.snapshot(context.deliveryId)).toEqual({ state: "queued", attempts: 1, reservations: 1, exposures: 1, suppressions: 0 });
      expect(transport.deniedRequests).toBe(0);
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);

  it.each([false, true])("should reject unavailable original payload material at the last observed security snapshot, replacement=%s", async (replaceMaterial) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupAuthority(database);
      await fixture.queueIndividual(1);
      const authorization = await fixture.deliveryRepository.authorize(await fixture.claim(), randomUUID());
      if (authorization.outcome !== "authorized") throw new Error("Final payload snapshot fixture did not obtain its original committed marker");
      const ring = fixture.keys.config.keyrings[MESSAGING_KEY_PURPOSE.operationPayload];
      const replacement = await crypto.subtle.importKey("raw", randomBytes(MESSAGING_CRYPTO.keyBytes), { name: MESSAGING_CRYPTO.macAlgorithm, hash: MESSAGING_CRYPTO.macHash }, false, ["sign", "verify"]);
      const brokenConfig = { ...fixture.keys.config, keyrings: { ...fixture.keys.config.keyrings, [MESSAGING_KEY_PURPOSE.operationPayload]: { ...ring, keys: replaceMaterial ? new Map([[ring.activeKeyId, replacement]]) : new Map<string, CryptoKey>() } } };
      let secretRead = false, snapshotsAfterSecret = 0, faultAtSnapshot: number | null = null, faultObserved = false;
      // Measure this owner's actual final observation without depending on a fixed number of internal reads.
      const preparation = new PostgresAdmissionNotificationDeliveryPreparation(fixture.deliveryExecute, { loadAuthorizedSecret: async (context) => {
        const credential = await fixture.secrets.loadAuthorizedSecret(context);
        secretRead = true;
        return credential;
      } }, async () => {
        if (!secretRead) return fixture.keys.config;
        snapshotsAfterSecret += 1;
        if (snapshotsAfterSecret === faultAtSnapshot) {
          faultObserved = true;
          return brokenConfig;
        }
        return fixture.keys.config;
      });
      await preparation.prepare(authorization.context, new AbortController().signal);
      expect(snapshotsAfterSecret).toBeGreaterThan(0);
      faultAtSnapshot = snapshotsAfterSecret;
      snapshotsAfterSecret = 0;
      secretRead = false;
      // Project only safe classification: plaintext prepared material never enters an assertion or receipt.
      const outcome = await preparation.prepare(authorization.context, new AbortController().signal).then(() => ({ status: "fulfilled", code: null }), (error: unknown) => ({ status: "rejected", code: error instanceof MessagingSecretAccessError ? error.code : "unclassified" }));
      expect({ ...outcome, faultObserved }).toEqual({ status: "rejected", code: MESSAGING_ERROR_CODE.connectionIncomplete, faultObserved: true });
      expect(await fixture.snapshot(authorization.context.deliveryId)).toEqual({ state: "queued", attempts: 1, reservations: 1, exposures: 2, suppressions: 0 });
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);
});
