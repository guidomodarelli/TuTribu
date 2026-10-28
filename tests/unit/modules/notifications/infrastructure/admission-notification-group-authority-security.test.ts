/** @vitest-environment node */
/** Distinguishes recoverable external key material from permanently unusable original content. @module admission-notification-group-authority-security-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationGroupAuthority } from "@/tests/support/admission-notification-group-authority-fixture";
import { ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { PostgresMessageDeliveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-repository";
import { MessagingDeliveryStorageError } from "@/src/modules/messaging/domain/errors/messaging-delivery-storage-error";
import { MESSAGING_CRYPTO } from "@/src/modules/messaging/constants/messaging-cryptography";
import { createAdmissionNotificationResourceAuthority } from "@/src/modules/notifications/infrastructure/messaging/admission-notification-resource-authority";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native whole group payload material availability", () => {
  it("should keep the original queued when the same payload key id has different material and resume after restoring its reconciled material", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupAuthority(database), [original] = await fixture.queueIndividual(1), claim = await fixture.claim();
      const replacement = await crypto.subtle.importKey("raw", randomBytes(MESSAGING_CRYPTO.keyBytes), { name: MESSAGING_CRYPTO.macAlgorithm, hash: MESSAGING_CRYPTO.macHash }, false, ["sign", "verify"]);
      const ring = fixture.keys.config.keyrings.operation_payload;
      const broken = { ...fixture.keys.config, keyrings: { ...fixture.keys.config.keyrings, operation_payload: { ...ring, keys: new Map([[ring.activeKeyId, replacement]]) } } };
      const brokenGuard = createAdmissionNotificationResourceAuthority(async () => broken);
      const repository = new PostgresMessageDeliveryRepository({ execute: fixture.deliveryExecute, authorizeMaintenance: fixture.deliveryAuthorize, readSecurityConfig: async () => broken, authorizeQueuedResource: brokenGuard.queued });
      let observed: { status: string; outcome: string | null; code: string | null };
      try {
        const result = await repository.authorize(claim, randomUUID());
        observed = { status: "fulfilled", outcome: result.outcome, code: null };
      } catch (error) {
        observed = { status: "rejected", outcome: null, code: error instanceof MessagingDeliveryStorageError ? error.code : "unclassified" };
      }
      expect.soft(observed).toEqual({ status: "rejected", outcome: null, code: "connection_incomplete" });
      expect.soft(await fixture.snapshot(original.deliveryId)).toEqual({ state: "queued", attempts: 0, reservations: 0, exposures: 0, suppressions: 0 });
      expect((await fixture.deliveryRepository.authorize(claim, randomUUID())).outcome).toBe("authorized");
      expect(await fixture.snapshot(original.deliveryId)).toEqual({ state: "queued", attempts: 1, reservations: 1, exposures: 0, suppressions: 0 });
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);
});
