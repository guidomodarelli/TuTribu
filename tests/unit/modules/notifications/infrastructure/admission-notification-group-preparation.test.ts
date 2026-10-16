/** @vitest-environment node */
/** Exercises atomic complete group intents against native PostgreSQL, current trust and real cryptography without sending. @module admission-notification-group-preparation-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationGroupsForEmail } from "@/tests/support/admission-notification-group-preparation-fixture";
import { prepareAdmissionNotificationGroup, insertAdmissionNotificationGroup, insertAdmissionNotificationGroupMember } from "@/tests/support/admission-notification-group-fixture";
import { seedContactVerificationDatabase } from "@/tests/support/contact-verification-database-fixture";
import { ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { PostgresAdmissionNotificationGroupPreparation } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-group-preparation";
import { createAdmissionNotificationEmailIntentMac } from "@/src/modules/notifications/infrastructure/encryption/admission-notification-email-intent-mac";
import type { AdmissionNotificationEmailIntent } from "@/src/modules/notifications/domain/entities/admission-notification-email-intent";
import type { AdmissionNotificationCollectionExecutor } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-collection-progress";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native complete admission notification preparation", () => {
  it("should wait for a real grouped boundary and atomically retain every member plus one complete authentic original outbox across competing preparation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupsForEmail(database);
      // Given genuine current collection, with real time reserved to keep both new sources in one bucket.
      await fixture.waitForCollectionWindow();
      const created = await fixture.createSources(2);
      const first = await fixture.collect(created.sources[0].obligation_id), second = await fixture.collect(created.sources[1].obligation_id);
      expect(second).toEqual(first);
      expect(await fixture.preparation.prepare(first)).toMatchObject({ status: "not_due", groupVersion: 1, deliveryId: null, replayed: false });
      const closes = await fixture.execute(async (transaction) => Number((await transaction.execute<{ instant: string }>(sql`select (extract(epoch from window_closes_at)*${MICROSECONDS_PER_SECOND})::bigint::text as instant from public.admission_notification_groups where id=${first.groupId}`)).rows[0].instant));
      await fixture.waitUntil(closes);

      // A currently unavailable selected resource leaves the exact open work intact for bounded later preparation.
      await fixture.execute((transaction) => transaction.execute(sql`update public.messaging_connection_capabilities set state='unavailable' where connection_id=${fixture.connectionId} and channel='email'`));
      expect(await fixture.preparation.prepare(first)).toMatchObject({ status: "unavailable", groupVersion: 1, deliveryId: null, reason: "email_capability_unavailable" });
      await fixture.execute((transaction) => transaction.execute(sql`update public.messaging_connection_capabilities set state='prepared' where connection_id=${fixture.connectionId} and channel='email'`));
      const results = await Promise.all([fixture.preparation.prepare(first), fixture.preparation.prepare(first)]);
      expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
      expect(results[0]).toMatchObject({ status: "queued", groupVersion: 2, reason: null });
      expect(results[1]).toEqual({ ...results[0], replayed: !results[0].replayed });
      const row = await fixture.execute(async (transaction) => (await transaction.execute<{ id: string; actor_user_id: string; connection_id: string; connection_version: number; recipient_ref: string; frozen_intent: AdmissionNotificationEmailIntent; payload_mac_key_id: string; payload_fingerprint: Uint8Array; idempotency_key: string; queued_usage_policy_version: number; created_microseconds: string; deadline_microseconds: string; group_deadline_microseconds: string; recipient_email: string; frozen_manifest: unknown; members: number; included: number; outboxes: number; attempts: number }>(sql`select delivery.id,delivery.actor_user_id,delivery.connection_id,delivery.connection_version,delivery.recipient_ref,delivery.frozen_intent,delivery.payload_mac_key_id,delivery.payload_fingerprint,delivery.idempotency_key,delivery.queued_usage_policy_version,
        (extract(epoch from delivery.created_at)*${MICROSECONDS_PER_SECOND})::bigint::text as created_microseconds,(extract(epoch from delivery.deadline_at)*${MICROSECONDS_PER_SECOND})::bigint::text as deadline_microseconds,
        (extract(epoch from notification_group.deadline_at)*${MICROSECONDS_PER_SECOND})::bigint::text as group_deadline_microseconds,lower(btrim(recipient.email)) as recipient_email,notification_group.frozen_manifest,
        (select count(*)::int from public.admission_notification_group_members where group_id=${first.groupId}) as members,
        (select count(*)::int from public.admission_notification_group_members where group_id=${first.groupId} and state='included') as included,
        (select count(*)::int from public.message_deliveries where notification_group_id=${first.groupId}) as outboxes,
        (select count(*)::int from public.message_delivery_attempts where delivery_id=delivery.id) as attempts
        from public.message_deliveries delivery join public.admission_notification_groups notification_group on notification_group.id=delivery.notification_group_id join public."user" recipient on recipient.id=delivery.recipient_ref where delivery.id=${results[0].deliveryId}`)).rows[0]);
      expect({ members: row.members, included: row.included, outboxes: row.outboxes, attempts: row.attempts }).toEqual({ members: 2, included: 2, outboxes: 1, attempts: 0 });
      expect(row.frozen_intent.manifest).toEqual(row.frozen_manifest);
      expect(row.frozen_intent.manifest.items.map((item) => item.obligationId).sort()).toEqual(created.sources.map((source) => source.obligation_id).sort());
      expect(row.deadline_microseconds).toBe(row.group_deadline_microseconds);
      expect(row.frozen_intent).toMatchObject({ format: 2, kind: "admission_notification_group", channel: "email", groupId: first.groupId, groupVersion: 2, subject: "TuTribu: solicitudes de ingreso pendientes" });
      expect(new URL(row.frozen_intent.href).pathname.endsWith("/academia/admissions")).toBe(true);
      expect(new URL(row.frozen_intent.href).search).toBe("");
      expect(JSON.stringify(row.frozen_intent)).not.toContain(row.recipient_email);
      expect(await createAdmissionNotificationEmailIntentMac(fixture.keys.config).verify({ tribeId: fixture.tribeId, deliveryId: row.id, originalDeliveryId: null, connectionId: row.connection_id, connectionVersion: row.connection_version, contributingLeaderUserId: row.actor_user_id, recipientUserId: row.recipient_ref, normalizedRecipientEmail: row.recipient_email, idempotencyKey: row.idempotency_key, queuedUsagePolicyVersion: row.queued_usage_policy_version, createdAtMicroseconds: Number(row.created_microseconds), deadlineAtMicroseconds: Number(row.deadline_microseconds), intent: row.frozen_intent }, { keyId: row.payload_mac_key_id, mac: row.payload_fingerprint })).toBe(true);
      await expect(fixture.preparation.prepare({ ...first, expectedVersion: 2 })).rejects.toMatchObject({ code: "request_conflict" });
      await expect(fixture.preparation.prepare({ ...first, tribeId: fixture.otherTribeId })).rejects.toMatchObject({ code: "permission_denied" });
    }, { concurrentTransactions: 2 });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);

  it("should roll back both a staged frozen group and its outbox on late authority or epoch loss and recover an actually committed response without another delivery", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupsForEmail(database);
      await fixture.execute((transaction) => transaction.execute(sql`insert into public.admission_notification_preferences(tribe_id,recipient_user_id,mode,version) values (${fixture.tribeId},${fixture.leaderId},'individual',1),(${fixture.tribeId},${fixture.guardianId},'individual',1)`));
      const created = await fixture.createSources(3), first = await fixture.collect(created.sources[0].obligation_id), second = await fixture.collect(created.sources[1].obligation_id), guardian = await fixture.collect(created.sources[2].obligation_id, fixture.guardianId);
      let stagedAuthority = false, stagedEpoch = false;
      const denied = new PostgresAdmissionNotificationGroupPreparation(fixture.preparationExecute, async (transaction, tribeId) => {
        const allowed = await fixture.preparationAuthorize(transaction, tribeId);
        stagedAuthority = Boolean((await transaction.execute(sql`select delivery.id from public.message_deliveries delivery join public.admission_notification_groups notification_group on notification_group.id=delivery.notification_group_id where notification_group.id=${first.groupId} and notification_group.state='frozen'`)).rows[0]);
        return allowed && !stagedAuthority;
      }, async () => fixture.keys.config, "https://example.invalid");
      await expect(denied.prepare(first)).rejects.toMatchObject({ code: "permission_denied" });
      expect(stagedAuthority).toBe(true);
      const epochChanged = new PostgresAdmissionNotificationGroupPreparation(fixture.preparationExecute, async (transaction, tribeId) => {
        const allowed = await fixture.preparationAuthorize(transaction, tribeId);
        stagedEpoch = Boolean((await transaction.execute(sql`select id from public.message_deliveries where notification_group_id=${second.groupId}`)).rows[0]);
        return allowed;
      }, async () => stagedEpoch ? { ...fixture.keys.config, securityEpoch: "changed-after-observed-staging" } : fixture.keys.config, "https://example.invalid");
      await expect(epochChanged.prepare(second)).rejects.toMatchObject({ code: "connection_incomplete" });
      expect(stagedEpoch).toBe(true);
      const rolledBack = await fixture.execute(async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.admission_notification_groups where id in (${first.groupId},${second.groupId}) and state='open' and version=1 and frozen_manifest is null) as open_groups,(select count(*)::int from public.admission_notification_group_members where group_id in (${first.groupId},${second.groupId}) and state='pending') as pending_members,(select count(*)::int from public.message_deliveries where notification_group_id in (${first.groupId},${second.groupId})) as deliveries`)).rows[0]);
      expect(rolledBack).toEqual({ open_groups: 2, pending_members: 2, deliveries: 0 });
      const committedThenLost: AdmissionNotificationCollectionExecutor = async (run) => { await fixture.preparationExecute(run); throw new Error("Synthetic response lost after actual commit"); };
      await expect(new PostgresAdmissionNotificationGroupPreparation(committedThenLost, fixture.preparationAuthorize, async () => fixture.keys.config, "https://example.invalid").prepare(first)).rejects.toMatchObject({ code: "operation_unresolved" });
      expect(await fixture.preparation.prepare(first)).toMatchObject({ status: "queued", groupVersion: 2, replayed: true });
      expect(await fixture.preparation.prepare(second)).toMatchObject({ status: "queued", replayed: false });

      const next = await fixture.createSources(2), omitted = await fixture.collect(next.sources[0].obligation_id), untrusted = await fixture.collect(next.sources[1].obligation_id);
      // The original notice does not preserve authority for a guardian whose current role was removed.
      await fixture.execute((transaction) => transaction.execute(sql`update public.tribe_members set role='tribemate' where tribe_id=${fixture.tribeId} and user_id=${fixture.guardianId}`));
      expect(await fixture.preparation.prepare(guardian)).toMatchObject({ status: "suppressed", reason: "recipient_not_authorized", deliveryId: null, replayed: false });
      await fixture.execute((transaction) => transaction.execute(sql`update public.admission_notification_preferences set mode='omitted',version=version+1 where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.leaderId}`));
      expect(await fixture.preparation.prepare(omitted)).toMatchObject({ status: "suppressed", reason: "preference_omitted", deliveryId: null });
      await fixture.execute((transaction) => transaction.execute(sql`update public.admission_notification_preferences set mode='individual',version=version+1 where tribe_id=${fixture.tribeId} and recipient_user_id=${fixture.leaderId}`));
      await fixture.execute((transaction) => transaction.execute(sql`update public.global_identity_evidence set invalidated_at=clock_timestamp(),invalidation_reason='synthetic_current_trust_removed' where user_id=${fixture.leaderId} and invalidated_at is null`));
      expect(await fixture.preparation.prepare(untrusted)).toMatchObject({ status: "suppressed", reason: "account_email_untrusted", deliveryId: null });
      expect(await fixture.execute(async (transaction) => (await transaction.execute(sql`select count(*)::int as deliveries from public.message_deliveries where tribe_id=${fixture.tribeId} and purpose='admission_notification'`)).rows[0])).toEqual({ deliveries: 2 });
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);

  it("should preserve original historical deadlines and close all expired or currently disabled groups without creating any outbox or touching the internal notices", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      for (const allExpired of [true, false]) {
        const fixture = await prepareAdmissionNotificationGroup(database, allExpired), keys = await seedContactVerificationDatabase(database), groupId = randomUUID();
        await insertAdmissionNotificationGroup(database, fixture, groupId);
        for (const obligationId of fixture.obligationIds.slice(0, 2)) await insertAdmissionNotificationGroupMember(database, fixture, groupId, obligationId);
        const authorize = async (transaction: RequestDatabase, tribeId: string) => tribeId === fixture.tribeId && (await transaction.execute<{ allowed: boolean }>(sql`select public.current_app_user_id() is null and has_function_privilege(current_user,'public.check_messaging_key_material_proof(text,text,bytea)','EXECUTE') as allowed`)).rows[0].allowed;
        const preparation = new PostgresAdmissionNotificationGroupPreparation((run) => database.withContext({ userId: null, email: null }, run), authorize, async () => keys.config, "https://example.invalid");
        const command = { tribeId: fixture.tribeId, groupId, expectedVersion: 1 };
        const result = await preparation.prepare(command);
        expect(result).toMatchObject({ groupVersion: 2, status: allExpired ? "expired" : "suppressed", deliveryId: null, reason: allExpired ? "notification_deadline_expired" : "email_disabled", replayed: false });
        expect(await preparation.prepare(command)).toEqual({ ...result, replayed: true });
        const observed = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select (select count(*)::int from public.message_deliveries where notification_group_id=${groupId}) as deliveries,(select count(*)::int from public.notifications where tribe_id=${fixture.tribeId}) as internal_notices,(select count(*)::int from public.admission_notification_group_members member join public.academy_admission_notification_obligations obligation on obligation.id=member.obligation_id where member.group_id=${groupId} and member.deadline_at=obligation.created_at+interval '24 hours') as original_deadlines`)).rows[0]);
        expect(observed).toEqual({ deliveries: 0, internal_notices: 2, original_deadlines: 2 });
      }
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);
});
