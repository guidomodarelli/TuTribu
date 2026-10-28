/** @vitest-environment node */
/** Exercises original group authority at real marker, secret and provider boundaries without sending. @module admission-notification-group-authority-integration-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationGroupAuthority } from "@/tests/support/admission-notification-group-authority-fixture";
import { ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import { PostgresMessageDeliveryRepository } from "@/src/modules/messaging/infrastructure/repositories/postgres-message-delivery-repository";
import { PostgresEncryptedSecretStore } from "@/src/modules/messaging/infrastructure/repositories/postgres-encrypted-secret-store";
import { PostgresCurrentMessagingProvider } from "@/src/modules/messaging/infrastructure/repositories/postgres-current-messaging-provider";
import { PostgresAdmissionNotificationDeliveryAuthority } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-delivery-authority";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native whole admission notification group authority", () => {
  it("should charge only notification budget and reopen neither provider nor credential after the original recipient opts out", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupAuthority(database), [original] = await fixture.queueIndividual(1), claim = await fixture.claim();
      expect(claim.deliveryId).toBe(original.deliveryId);
      const missing = new PostgresMessageDeliveryRepository({ execute: fixture.deliveryExecute, authorizeMaintenance: fixture.deliveryAuthorize, readSecurityConfig: fixture.readSecurityConfig });
      await expect(missing.authorize(claim, randomUUID())).rejects.toMatchObject({ code: "connection_incomplete" });
      expect(await fixture.snapshot(original.deliveryId)).toEqual({ state: "queued", attempts: 0, reservations: 0, exposures: 0, suppressions: 0 });
      const authorized = await fixture.deliveryRepository.authorize(claim, randomUUID());
      if (authorized.outcome !== "authorized") throw new Error("Native current whole group did not receive a committed marker");
      expect(await fixture.snapshot(original.deliveryId)).toEqual({ state: "queued", attempts: 1, reservations: 1, exposures: 0, suppressions: 0 });
      expect(await fixture.execute(async (transaction) => (await transaction.execute(sql`select category,state from public.messaging_usage_reservations where delivery_id=${original.deliveryId}`)).rows)).toEqual([{ category: "notification", state: "consumed" }]);
      const unguardedSecrets = new PostgresEncryptedSecretStore({ executeWithDatabase: fixture.deliveryExecute, accounts: { getAuthenticatedAccount: async () => null }, readSecurityConfig: fixture.readSecurityConfig, purpose: "authorized_delivery" });
      const unguardedProvider = new PostgresCurrentMessagingProvider((context, run) => fixture.deliveryExecute(context.authorizationPurpose === "authorized_delivery" ? context.contributingLeaderUserId : context.actorUserId, run), async () => ({ environment: fixture.keys.config.environment, securityEpoch: fixture.keys.config.securityEpoch, recoveryLocked: false }));
      await expect(unguardedSecrets.loadAuthorizedSecret(authorized.context)).rejects.toMatchObject({ code: "resource_unavailable" });
      await expect(unguardedProvider.read(authorized.context)).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(await fixture.provider.read(authorized.context)).toBe("zavu");
      const credential = await fixture.secrets.loadAuthorizedSecret(authorized.context);
      expect(credential.length > 0).toBe(true);
      expect(await fixture.snapshot(original.deliveryId)).toEqual({ state: "queued", attempts: 1, reservations: 1, exposures: 1, suppressions: 0 });
      await fixture.execute((transaction) => transaction.execute(sql`update public.admission_notification_preferences set mode='omitted',version=version+1 where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.leaderId}`));
      await expect(fixture.secrets.loadAuthorizedSecret(authorized.context)).rejects.toMatchObject({ code: "resource_unavailable" });
      await expect(fixture.provider.read(authorized.context)).rejects.toMatchObject({ code: "resource_unavailable" });
      expect(await fixture.snapshot(original.deliveryId)).toEqual({ state: "queued", attempts: 1, reservations: 1, exposures: 1, suppressions: 0 });
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);

  it("should preserve temporarily unavailable work then suppress a current opt-out before reserving any budget", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupAuthority(database), [original] = await fixture.queueIndividual(1), claim = await fixture.claim();
      await fixture.execute((transaction) => transaction.execute(sql`update public.messaging_connection_capabilities set state='unavailable' where connection_id=${fixture.connectionId} and channel='email'`));
      await expect(fixture.deliveryRepository.authorize(claim, randomUUID())).rejects.toMatchObject({ code: "connection_incomplete" });
      expect(await fixture.snapshot(original.deliveryId)).toEqual({ state: "queued", attempts: 0, reservations: 0, exposures: 0, suppressions: 0 });
      await fixture.execute((transaction) => transaction.execute(sql`update public.messaging_connection_capabilities set state='prepared' where connection_id=${fixture.connectionId} and channel='email'`));
      await fixture.execute((transaction) => transaction.execute(sql`update public.admission_notification_preferences set mode='omitted',version=version+1 where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.leaderId}`));
      expect(await fixture.deliveryRepository.authorize(claim, randomUUID())).toMatchObject({ outcome: "suppressed", deliveryId: original.deliveryId });
      expect(await fixture.snapshot(original.deliveryId)).toEqual({ state: "suppressed", attempts: 0, reservations: 0, exposures: 0, suppressions: 1 });
      expect(await fixture.deliveryRepository.authorize(claim, randomUUID())).toMatchObject({ outcome: "stale", deliveryId: original.deliveryId });
      expect(await fixture.snapshot(original.deliveryId)).toEqual({ state: "suppressed", attempts: 0, reservations: 0, exposures: 0, suppressions: 1 });
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);

  it("should reject a two-source original after genuine removal of its second applicant instead of using the first surviving obligation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupAuthority(database);
      await fixture.waitForCollectionWindow();
      const created = await fixture.createSources(2), original = await fixture.collect(created.sources[0].obligation_id);
      expect(await fixture.collect(created.sources[1].obligation_id)).toEqual(original);
      const closes = await fixture.execute(async (transaction) => Number((await transaction.execute<{ instant: string }>(sql`select (extract(epoch from window_closes_at)*${MICROSECONDS_PER_SECOND})::bigint::text as instant from public.admission_notification_groups where id=${original.groupId}`)).rows[0].instant));
      await fixture.waitUntil(closes);
      const prepared = await fixture.preparation.prepare(original);
      if (prepared.status !== "queued") throw new Error("Native two-source group did not prepare its original outbox");
      const scope = { tribeId: fixture.tribeId, deliveryId: prepared.deliveryId! };
      const read = () => fixture.preparationExecute((transaction) => new PostgresAdmissionNotificationDeliveryAuthority(transaction, fixture.preparationAuthorize, fixture.readSecurityConfig).read(scope));
      expect((await read()).status).toBe("current");
      const claim = await fixture.claim();
      await database.withContext({ userId: created.sources[1].user_id, email: null }, (transaction) => transaction.execute(sql`delete from public."user" where id=${created.sources[1].user_id}`));
      expect(await read()).toEqual({ status: "denied", reason: "notification_group_manifest_changed" });
      expect(await fixture.deliveryRepository.authorize(claim, randomUUID())).toMatchObject({ outcome: "suppressed", deliveryId: prepared.deliveryId });
      expect(await fixture.snapshot(prepared.deliveryId!)).toEqual({ state: "suppressed", attempts: 0, reservations: 0, exposures: 0, suppressions: 1 });
      expect(await fixture.execute(async (transaction) => (await transaction.execute(sql`select jsonb_array_length(frozen_manifest->'items') as original_items,(select count(*)::int from public.admission_notification_group_members where group_id=${original.groupId}) as remaining_members,(select count(*)::int from public.message_deliveries where notification_group_id=${original.groupId}) as outboxes from public.admission_notification_groups where id=${original.groupId}`)).rows[0])).toEqual({ original_items: 2, remaining_members: 1, outboxes: 1 });
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);
});
