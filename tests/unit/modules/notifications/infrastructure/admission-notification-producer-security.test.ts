/** @vitest-environment node */
/** Exercises certified availability, fair key-independent turns, real bearer revocation and private RLS. @module admission-notification-producer-security-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationCollectionProgress } from "@/tests/support/admission-notification-collection-progress-fixture";
import { prepareAdmissionNotificationReminders } from "@/tests/support/admission-notification-reminder-fixture";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE } from "@/src/modules/notifications/constants/admission-notification-source-selection";
import { PostgresAdmissionNotificationProducer } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-producer";
import { buildAdmissionNotificationProducerModule } from "@/src/modules/notifications/setup";
import { createRequestMessagingMaintenanceAuthorizer } from "@/src/modules/messaging/infrastructure/auth/request-maintenance-authorizer";
import { MESSAGING_DISPATCH_DEFAULT } from "@/src/modules/messaging/constants/messaging-dispatch";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { MESSAGING_CRYPTO_ERROR } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { AdmissionNotificationCollectionExecutor } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-collection-progress";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission notification producer availability and purpose", () => {
  it("should retain an unavailable earlier page until a genuinely new complete available sweep certifies its original cutoff", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationCollectionProgress(database);
      /** @returns Original delivery identities and clocks, including the fixture's historical contact verifications. */
      const deliveries = () => fixture.execute(async (transaction) => (await transaction.execute(sql`select id,purpose,notification_group_id,state,created_at::text,deadline_at::text from public.message_deliveries where tribe_id=${fixture.tribeId} order by id`)).rows);
      const originalDeliveries = await deliveries();
      expect(originalDeliveries.length).toBeGreaterThan(0);
      await fixture.createSources(Math.ceil(ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE / 2));
      await fixture.execute((transaction) => transaction.execute(sql`update public.messaging_connection_capabilities set state='unavailable' where connection_id=${fixture.connectionId} and channel='email'`));
      const first = await fixture.repository.collectPage({ tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: 0 });
      expect(first).toMatchObject({ sweepComplete: false, sweepHadUnavailable: true, collected: 0 });
      const secret = randomUUID(), request = new Request("https://example.invalid/maintenance", { headers: { authorization: `Bearer ${secret}` } });
      const authorize = createRequestMessagingMaintenanceAuthorizer(request, () => secret);
      const execute: AdmissionNotificationCollectionExecutor = (run) => database.withContext(fixture.system, run);
      const runtime = { now: Date.now, createId: randomUUID, report: () => undefined };
      const unavailable = buildAdmissionNotificationProducerModule({ execute, authorize, readRecoveryLock: async () => false, readSecurityConfig: async (): Promise<never> => { throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration); }, publicAppBaseUrl: "https://example.invalid", runtime });
      const deferred = await unavailable.useCases.prepareEmailNotifications.execute(Date.now() + MESSAGING_DISPATCH_DEFAULT.runBudgetMs);
      expect(deferred.tribes.find((tribe) => tribe.tribeId === fixture.tribeId)).toMatchObject({ hasContinuation: true, collection: { status: "failed", code: "connection_incomplete" } });
      expect((await fixture.repository.readProgress(fixture.tribeId)).lastPage).toEqual(first);
      await fixture.execute((transaction) => transaction.execute(sql`update public.messaging_connection_capabilities set state='prepared' where connection_id=${fixture.connectionId} and channel='email'`));
      let dropped = false;
      /** @param run - Original real owner operation. @returns Its committed value, except one deliberately lost page response after the actual checkpoint advances. */
      const uncertainExecute: AdmissionNotificationCollectionExecutor = async (run) => {
        let advanced = false;
        const result = await execute(async (transaction) => {
          const before = (await transaction.execute<{ version: number }>(sql`select version from public.admission_notification_collection_progress where tribe_id=${fixture.tribeId}`)).rows[0].version;
          const value = await run(transaction);
          const after = (await transaction.execute<{ version: number }>(sql`select version from public.admission_notification_collection_progress where tribe_id=${fixture.tribeId}`)).rows[0].version;
          advanced = after > before;
          return value;
        });
        if (advanced && !dropped) { dropped = true; throw new Error("Synthetic original page response lost after its native commit"); }
        return result;
      };
      const uncertain = buildAdmissionNotificationProducerModule({ execute: uncertainExecute, authorize, readRecoveryLock: async () => false, readSecurityConfig: async () => fixture.keys.config, publicAppBaseUrl: "https://example.invalid", runtime });
      const lost = await uncertain.useCases.prepareEmailNotifications.execute(Date.now() + MESSAGING_DISPATCH_DEFAULT.runBudgetMs);
      const originalPage = lost.tribes.find((tribe) => tribe.tribeId === fixture.tribeId)!;
      expect(dropped).toBe(true);
      expect(originalPage).toMatchObject({ hasContinuation: null, collection: { status: "unresolved", code: "operation_unresolved" } });
      const second = (await fixture.repository.readProgress(fixture.tribeId)).lastPage!;
      expect(second.operationId).toBe(originalPage.operationId);
      expect(second.version).toBe(first.version + 1);
      expect(second).toMatchObject({ sweepComplete: true, sweepHadUnavailable: true });
      expect(second.sourceThroughMicroseconds).toBe(first.sourceThroughMicroseconds);
      expect((await fixture.repository.readProgress(fixture.tribeId)).lastCertifiedThroughMicroseconds).toBeNull();
      const third = await fixture.repository.collectPage({ tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: second.version });
      expect(third).toMatchObject({ sweepComplete: false, sweepHadUnavailable: false });
      const fourth = await fixture.repository.collectPage({ tribeId: fixture.tribeId, operationId: randomUUID(), expectedVersion: third.version });
      expect(fourth).toMatchObject({ sweepComplete: true, sweepHadUnavailable: false });
      expect((await fixture.repository.readProgress(fixture.tribeId)).lastCertifiedThroughMicroseconds).toBe(third.sourceThroughMicroseconds);
      expect(await deliveries()).toEqual(originalDeliveries);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);

  it("should materialize internal reminders without keys, rotate failed email tenants and roll back a turn on late real bearer revocation", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationReminders(database);
      const execute: AdmissionNotificationCollectionExecutor = (run) => database.withContext(fixture.system, run);
      const originalSecret = randomUUID();
      let currentSecret = originalSecret;
      const request = new Request("https://example.invalid/maintenance", { headers: { authorization: `Bearer ${originalSecret}` } });
      const authorize = createRequestMessagingMaintenanceAuthorizer(request, () => currentSecret);
      await execute((transaction) => transaction.execute(sql`insert into public.admission_email_settings(tribe_id,enabled,enabled_at,version,time_zone,changed_by_user_id) values (${fixture.tribeId},true,clock_timestamp(),1,'UTC',${fixture.leaderId}),(${fixture.otherTribeId},true,clock_timestamp(),1,'UTC',${fixture.otherLeaderId})`));
      const readSecurityConfig = vi.fn(async (): Promise<never> => { throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration); });
      const producerModule = buildAdmissionNotificationProducerModule({ execute, authorize, readRecoveryLock: async () => false, readSecurityConfig, publicAppBaseUrl: "https://example.invalid", runtime: { now: Date.now, createId: randomUUID, report: () => undefined } });
      const result = await producerModule.useCases.prepareEmailNotifications.execute(Date.now() + MESSAGING_DISPATCH_DEFAULT.runBudgetMs);
      expect(result.reminders).toEqual({ status: "completed", count: 2, code: null });
      expect(result.tribes.map((tribe) => tribe.tribeId).sort()).toEqual([fixture.tribeId, fixture.otherTribeId].sort());
      expect(result.tribes.every((tribe) => tribe.collection.status === "failed" && tribe.collection.code === "connection_incomplete")).toBe(true);
      expect(readSecurityConfig).toHaveBeenCalledTimes(2);
      const producer = new PostgresAdmissionNotificationProducer(execute, authorize, async () => false);
      expect(await producer.materializeReminders()).toBe(0);
      const selected = [await producer.selectNextTribe([]), await producer.selectNextTribe([]), await producer.selectNextTribe([])];
      expect(new Set(selected.slice(0, 2)).size).toBe(2);
      expect(selected[2]).toBe(selected[0]);
      /** @returns Current private selection metadata only, without contacts, keys or request contents. */
      const turns = () => execute(async (transaction) => (await transaction.execute(sql`select tribe_id,version,last_selected_at::text from public.admission_notification_producer_progress where tribe_id in (${fixture.tribeId},${fixture.otherTribeId}) order by tribe_id`)).rows);
      const originalTurns = await turns();
      let checks = 0;
      const revoked = new PostgresAdmissionNotificationProducer(execute, async () => { if (++checks === 2) currentSecret = randomUUID(); return authorize(); }, async () => false);
      await expect(revoked.selectNextTribe([])).rejects.toMatchObject({ code: "permission_denied" });
      expect(await turns()).toEqual(originalTurns);
      currentSecret = originalSecret;
      await expect(new PostgresAdmissionNotificationProducer(execute, authorize, async () => true).selectNextTribe([])).rejects.toMatchObject({ code: "connection_incomplete" });
      expect(await turns()).toEqual(originalTurns);
      await database.grantTablesToNonBypass(["admission_notification_producer_progress"]);
      expect(await database.withContext({ userId: fixture.leaderId, email: null }, async (transaction) => (await transaction.execute(sql`select tribe_id from public.admission_notification_producer_progress`)).rows, "non_bypass")).toEqual([]);
      await expect(database.withContext({ userId: fixture.leaderId, email: null }, (transaction) => transaction.execute(sql`insert into public.admission_notification_producer_progress(tribe_id) values (${fixture.tribeId})`), "non_bypass")).rejects.toMatchObject({ cause: { code: "42501" } });
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
