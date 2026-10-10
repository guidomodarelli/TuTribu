/** @vitest-environment node */
/** Exercises queue stop, secret destruction and late original receipts after physical tribe deletion. @module admission-tribe-messaging-retirement-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareVerificationDeliveryPipeline } from "@/tests/support/verification-delivery-pipeline-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { ZavuMessageDeliverySender } from "@/src/modules/messaging/infrastructure/zavu/zavu-message-delivery-sender";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("physical tribe messaging retirement", () => {
  it.each(["queued", "in_flight"] as const)("should stop new sends and preserve original %s accounting when a tribe is deleted", async (stage) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareVerificationDeliveryPipeline(database);
      for (const migration of ["20261005093000_guard_academy_membership_sources.sql", "20261010100000_minimize_deleted_admission_contact_owners.sql", "20261010113000_preserve_admission_tribe_namespaces.sql", "20261010120000_archive_deleted_admission_tribe_provenance.sql", "20261010121000_retire_deleted_tribe_messaging.sql"]) await database.applyMigration(migration);
      await expect(database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`delete from public.tribes where id=${fixture.scope.tribeId}`);
        throw new Error("Controlled messaging retirement rollback");
      })).rejects.toThrow("Controlled messaging retirement rollback");
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select retired_at is null as active from public.academy_admission_tribe_namespaces where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([{ active: true }]);
        expect((await transaction.execute(sql`select retired_at is null and iv is not null and ciphertext is not null and purged_at is null as usable from public.messaging_secret_envelopes where connection_id=${fixture.scope.connectionId}`)).rows).toEqual([{ usable: true }]);
        expect((await transaction.execute(sql`select state from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: "queued" }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.academy_admission_retired_operations where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([{ total: 0 }]);
      });
      const providerId = randomUUID();
      const transport = createAdmissionProviderTransport(stage === "queued" ? [] : [{ origin: "https://api.zavu.dev", pathname: "/v1/messages", method: "POST", respond: async (request) => {
        expect(fixture.transactions).toBe(0);
        expect(request.headers.get("Authorization") === `Bearer ${fixture.credential}`).toBe(true);
        // The original RPC already crossed the boundary; physical retirement cannot withdraw it.
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.tribes where id=${fixture.scope.tribeId}`));
        return Response.json({ message: { id: providerId, direction: "outbound", channel: "email", status: "sent" } });
      } }]);
      const sender = new ZavuMessageDeliverySender(fixture.preparation, transport.fetch);
      if (stage === "queued") {
        await database.withContext(fixture.own, (transaction) => transaction.execute(sql`delete from public.tribes where id=${fixture.scope.tribeId}`));
        expect(await fixture.repository.claim({ leaseToken: randomUUID(), limit: 1, leaseSeconds: 90 })).toEqual([]);
      } else {
        const claim = (await fixture.repository.claim({ leaseToken: randomUUID(), limit: 1, leaseSeconds: 90 }))[0];
        const authorized = await fixture.repository.authorize(claim, randomUUID());
        if (authorized.outcome !== "authorized") throw new Error("Deleted tribe receipt fixture failed: original_marker_unavailable");
        const receipt = await sender.send(authorized.context, new AbortController().signal);
        expect(receipt).toMatchObject({ outcome: "accepted", providerMessageId: providerId });
        expect(await fixture.repository.complete({ context: authorized.context, ...receipt })).toMatchObject({ outcome: "completed" });
        expect(await fixture.repository.complete({ context: authorized.context, ...receipt })).toMatchObject({ outcome: "unchanged" });
        await expect(sender.send(authorized.context, new AbortController().signal)).rejects.toBeInstanceOf(MessagingSecretAccessError);
      }
      expect(transport.receipts).toHaveLength(stage === "queued" ? 0 : 1);
      expect(transport.deniedRequests).toBe(0);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select count(*)::int as total from public.tribes where id=${fixture.scope.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select state,retired_at is not null as retired,is_selected,is_candidate from public.tenant_messaging_connections where id=${fixture.scope.connectionId}`)).rows).toEqual([{ state: "disconnected", retired: true, is_selected: false, is_candidate: false }]);
        expect((await transaction.execute(sql`select iv is null and ciphertext is null and purged_at is not null as purged from public.messaging_secret_envelopes where connection_id=${fixture.scope.connectionId}`)).rows).toEqual([{ purged: true }]);
        expect((await transaction.execute(sql`select state,connection_id,connection_version from public.message_deliveries where id=${fixture.original.deliveryId}`)).rows).toEqual([{ state: stage === "queued" ? "cancelled" : "accepted", connection_id: fixture.scope.connectionId, connection_version: 1 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.contact_verification_challenges where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.verification_code_envelopes where tribe_id=${fixture.scope.tribeId}`)).rows).toEqual([{ total: 0 }]);
        expect((await transaction.execute(sql`select state from public.messaging_usage_reservations where delivery_id=${fixture.original.deliveryId}`)).rows).toEqual(stage === "queued" ? [] : [{ state: "consumed" }]);
        expect((await transaction.execute(sql`select count(*)::int as total from public.messaging_usage_events where tribe_id=${fixture.scope.tribeId} and event_type='code_request'`)).rows).toEqual([{ total: 1 }]);
      });
    });
  }, 1_200_000);
});
