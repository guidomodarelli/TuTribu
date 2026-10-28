/** @vitest-environment node */
/** Exercises a persisted original payload and charged marker through retained/removed keyrings and a real SDK send. @module payload-key-rotation-persistence-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareVerificationDeliveryPipeline } from "@/tests/support/verification-delivery-pipeline-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { PostgresEncryptedSecretStore } from "@/src/modules/messaging/infrastructure/repositories/postgres-encrypted-secret-store";
import { PostgresVerificationDeliveryPreparation } from "@/src/modules/messaging/infrastructure/repositories/postgres-verification-delivery-preparation";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { MESSAGING_CRYPTO, MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { ADMISSION_SECURITY_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-security";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("persisted original payload key rotation", () => {
  it("should retain the original key and reservation, close a removed key before SDK access and send the same original once after reconciliation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareVerificationDeliveryPipeline(database);
      const operationId = await database.withContext(fixture.own, async (transaction) => (await transaction.execute<{ idempotency_key: ReturnType<typeof randomUUID> }>(sql`select operation.idempotency_key from public.academy_admission_operations operation join public.message_deliveries delivery on delivery.idempotency_key=operation.id where delivery.id=${fixture.original.deliveryId} and operation.tribe_id=${fixture.scope.tribeId} and operation.actor_user_id=${fixture.userId}`)).rows.at(0)?.idempotency_key);
      if (!operationId) throw new Error("Payload rotation setup failed: original operation unavailable");
      const oldRing = fixture.config.keyrings[MESSAGING_KEY_PURPOSE.operationPayload], nextKeyId = randomUUID();
      const nextKey = await crypto.subtle.importKey("raw", randomBytes(MESSAGING_CRYPTO.keyBytes), { name: MESSAGING_CRYPTO.macAlgorithm, hash: MESSAGING_CRYPTO.macHash }, false, ["sign", "verify"]);
      const retained: MessagingSecurityConfig = { ...fixture.config, keyrings: { ...fixture.config.keyrings, operation_payload: { ...oldRing, activeKeyId: nextKeyId, keys: new Map([...oldRing.keys, [nextKeyId, nextKey]]) } } };
      const removed: MessagingSecurityConfig = { ...retained, keyrings: { ...retained.keyrings, operation_payload: { ...retained.keyrings.operation_payload, keys: new Map([[nextKeyId, nextKey]]) } } };
      let current = retained, credentialReads = 0;
      const secrets = new PostgresEncryptedSecretStore({ executeWithDatabase: fixture.execute, accounts: { getAuthenticatedAccount: async () => null }, readSecurityConfig: async () => current, purpose: "authorized_delivery" });
      const preparation = new PostgresVerificationDeliveryPreparation(fixture.execute, { loadAuthorizedSecret: async (context) => { credentialReads += 1; return secrets.loadAuthorizedSecret(context); } }, async () => current);
      const claim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 1, leaseSeconds: 300 }))[0];
      if (!claim) throw new Error("Payload rotation setup failed: original claim unavailable");
      const authorization = await fixture.repository.authorize(claim, randomUUID());
      if (authorization.outcome !== "authorized") throw new Error("Payload rotation setup failed: original marker unavailable");
      const before = await fixture.snapshot();
      expect(before.reservations).toMatchObject([{ state: "consumed" }]);
      /** @returns Only immutable identifiers, public lifecycle state and counts; no ciphertext, MAC or contact. */
      const originalFacts = () => database.withContext(fixture.own, async (transaction) => ({
        payload: (await transaction.execute(sql`select payload_mac_key_id,connection_id,connection_version,created_at::text,deadline_at::text from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows[0],
        budget: (await transaction.execute(sql`select count(*)::int as count from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId}`)).rows[0],
      }));
      const facts = await originalFacts();
      expect(facts.payload).toMatchObject({ payload_mac_key_id: oldRing.activeKeyId, connection_version: 1 });
      await preparation.prepare(authorization.context, new AbortController().signal);
      expect(credentialReads).toBe(1);
      expect(await fixture.snapshot()).toEqual(before);
      current = removed;
      await expect(preparation.prepare(authorization.context, new AbortController().signal)).rejects.toMatchObject({ code: "messaging_crypto_key_unavailable" });
      expect(credentialReads).toBe(1);
      expect(await fixture.snapshot()).toEqual(before);
      expect(await originalFacts()).toEqual(facts);
      current = retained;
      const providerId = randomUUID();
      const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
        expect(request.headers.get("Authorization") === `Bearer ${fixture.credential}`).toBe(true);
        expect(fixture.transactions).toBe(0);
        return Response.json({ message: { id: providerId, direction: "outbound", channel: "email", status: "sent" } });
      } }]);
      const sender = new ZavuMessageDeliverySender(preparation, transport.fetch);
      const receipt = await sender.send(authorization.context, new AbortController().signal);
      expect(receipt).toMatchObject({ outcome: "accepted", providerMessageId: providerId });
      expect(await fixture.repository.complete({ context: authorization.context, ...receipt })).toMatchObject({ outcome: "completed" });
      expect(transport.receipts).toHaveLength(1);
      const delivered = await fixture.snapshot();
      expect(delivered.delivery).toMatchObject({ state: "accepted", connection_version: 1 });
      expect(delivered.reservations).toEqual(before.reservations);
      const replay = await fixture.issue(null, operationId);
      expect(replay).toMatchObject({ state: "completed", replayed: true, result: { deliveryId: fixture.original.deliveryId } });
      expect(await fixture.snapshot()).toEqual(delivered);
      expect(await originalFacts()).toEqual(facts);
      expect(transport.receipts).toHaveLength(1);
    });
  }, ADMISSION_SECURITY_TEST_TIMEOUT_MS);
});
