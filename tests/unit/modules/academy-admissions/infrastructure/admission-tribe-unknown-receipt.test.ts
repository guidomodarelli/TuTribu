/** @vitest-environment node */
/** Exercises uncertain original delivery evidence after a tribe is physically retired. @module admission-tribe-unknown-receipt-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareVerificationDeliveryPipeline } from "@/tests/support/verification-delivery-pipeline-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MESSAGE_RECEIPT_REASON } from "@/src/modules/messaging/constants/message-delivery";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("retired tribe unknown original receipt", () => {
  it("should keep an uncertain attempt charged and accept late evidence without another provider POST or a restored secret", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareVerificationDeliveryPipeline(database);
      for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261010100000_minimize_deleted_admission_contact_owners.sql", "20261010113000_preserve_admission_tribe_namespaces.sql", "20261010120000_archive_deleted_admission_tribe_provenance.sql", "20261010121000_retire_deleted_tribe_messaging.sql"]) await database.applyMigration(migration);
      const transport = createAdmissionProviderTransport([{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async () => {
        expect(fixture.transactions).toBe(0);
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.tribes where id=${fixture.scope.tribeId}`));
        throw new TypeError("Controlled original response loss after retirement");
      } }]);
      const sender = new ZavuMessageDeliverySender(fixture.preparation, transport.fetch);
      const claim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 1, leaseSeconds: 90 }))[0];
      const authorized = await fixture.repository.authorize(claim, randomUUID());
      if (authorized.outcome !== "authorized") throw new Error("Unknown retired tribe fixture failed: original_marker_unavailable");
      const receipt = await sender.send(authorized.context, new AbortController().signal);
      expect(receipt).toMatchObject({ outcome: "unknown" });
      expect(await fixture.repository.complete({ context: authorized.context, ...receipt })).toMatchObject({ outcome: "completed" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select state from public.message_delivery_attempts where id=${authorized.context.attemptId}`)).rows).toEqual([{ state: "unknown" }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "consumed" }]);
        expect((await transaction.execute(sql`select iv is null and ciphertext is null and purged_at is not null as purged from public.messaging_secret_envelopes where connection_id=${fixture.scope.connectionId}`)).rows).toEqual([{ purged: true }]);
      });
      expect(await fixture.repository.claim({ leaseToken: randomUUID(), limit: 1, leaseSeconds: 90 })).toEqual([]);
      await expect(sender.send(authorized.context, new AbortController().signal)).rejects.toBeInstanceOf(MessagingSecretAccessError);
      const providerMessageId = randomUUID();
      const lateReceipt = { context: authorized.context, outcome: "accepted" as const, providerMessageId, correlationId: null, reason: MESSAGE_RECEIPT_REASON.accepted };
      expect(await fixture.repository.complete(lateReceipt)).toMatchObject({ outcome: "completed" });
      expect(await fixture.repository.complete(lateReceipt)).toMatchObject({ outcome: "unchanged" });
      const state = await fixture.snapshot();
      expect(state.delivery).toMatchObject({ state: "accepted", connection_id: fixture.scope.connectionId, connection_version: 1 });
      expect(state.attempts).toHaveLength(1);
      expect(state.attempts[0]).toMatchObject({ id: authorized.context.attemptId, state: "accepted", provider_message_id: providerMessageId });
      expect(state.reservations).toHaveLength(1);
      expect(state.reservations[0]).toMatchObject({ state: "consumed" });
      expect(transport.receipts).toHaveLength(1);
      expect(transport.deniedRequests).toBe(0);
    });
  }, 1_200_000);
});
