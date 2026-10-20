/** @vitest-environment node */
/** Exercises real protected producer composition across multiple pages and a genuine grouped boundary. @module admission-notification-producer-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationGroupsForEmail } from "@/tests/support/admission-notification-group-preparation-fixture";
import { ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE } from "@/src/modules/notifications/constants/admission-notification-source-selection";
import { buildAdmissionNotificationProducerModule } from "@/src/modules/notifications/setup";
import { PostgresAdmissionNotificationProducer } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-producer";
import { createRequestMessagingMaintenanceAuthorizer } from "@/src/modules/messaging/infrastructure/auth/request-maintenance-authorizer";
import { MESSAGING_DISPATCH_DEFAULT } from "@/src/modules/messaging/constants/messaging-dispatch";
import { MICROSECONDS_PER_SECOND } from "@/src/constants/time";
import type { AdmissionNotificationEmailIntent } from "@/src/modules/notifications/domain/entities/admission-notification-email-intent";

/** Upper bound of turns for one sweep: even a page cut to a single chunk per turn finishes these sources well before it. */
const MAXIMUM_SWEEP_TURNS = 10;

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native protected whole admission notification producer", () => {
  it("should traverse every original page before freezing a whole closed window through the real composed producer without sending", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationGroupsForEmail(database);
      const secret = randomUUID(), request = new Request("https://example.invalid/maintenance", { headers: { authorization: `Bearer ${secret}` } });
      const authorize = createRequestMessagingMaintenanceAuthorizer(request, () => secret);
      const failures: unknown[] = [];
      const producerModule = buildAdmissionNotificationProducerModule({ execute: fixture.preparationExecute, authorize, readRecoveryLock: async () => false, readSecurityConfig: async () => fixture.keys.config, publicAppBaseUrl: "https://example.invalid", runtime: { now: Date.now, createId: randomUUID, report: (error) => { failures.push(error); } } });
      const producer = new PostgresAdmissionNotificationProducer(fixture.preparationExecute, authorize, async () => false);
      /** @returns One genuine invocation with the unchanged production host budget, without retrying a failed page. */
      const turn = async () => {
        const result = await producerModule.useCases.prepareEmailNotifications.execute(Date.now() + MESSAGING_DISPATCH_DEFAULT.runBudgetMs);
        expect(failures).toEqual([]);
        expect(result.tribes.some((tribe) => tribe.tribeId === fixture.tribeId)).toBe(true);
        return result;
      };
      /**
       * A page may stop at the run's soft deadline on a distant database and resume in the next turn, so a sweep can take several turns.
       * @returns The progress once the current sweep completed, after one genuine turn per committed page.
       */
      const turnUntilSweepComplete = async () => {
        for (let turns = 0; turns < MAXIMUM_SWEEP_TURNS; turns++) {
          await turn();
          const progress = await fixture.repository.readProgress(fixture.tribeId);
          if (!progress.hasContinuation) return progress;
          expect(await producer.readReadyGroups(fixture.tribeId)).toEqual([]);
        }
        throw new Error("Native producer sweep did not complete within the bounded turns");
      };
      await fixture.waitForCollectionWindow();
      const sourceCount = Math.ceil(ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE / 2);
      const created = await fixture.createSources(sourceCount);
      await turn();
      const first = await fixture.repository.readProgress(fixture.tribeId);
      expect(first).toMatchObject({ version: 1, hasContinuation: true, lastCertifiedThroughMicroseconds: null });
      expect(first.lastPage).toMatchObject({ sweepComplete: false, sweepHadUnavailable: false });
      expect(first.lastPage!.examined).toBeGreaterThan(0);
      expect(first.lastPage!.examined).toBeLessThanOrEqual(ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE);
      expect(await producer.readReadyGroups(fixture.tribeId)).toEqual([]);
      const completed = await turnUntilSweepComplete();
      expect(completed).toMatchObject({ hasContinuation: false, lastCertifiedThroughMicroseconds: first.lastPage!.sourceThroughMicroseconds });
      expect(completed.lastPage!.sourceThroughMicroseconds).toBe(first.lastPage!.sourceThroughMicroseconds);
      const group = await fixture.execute(async (transaction) => (await transaction.execute<{ id: string; closes: string; members: number }>(sql`select notification_group.id,(extract(epoch from notification_group.window_closes_at)*${MICROSECONDS_PER_SECOND})::bigint::text as closes,count(member.obligation_id)::int as members from public.admission_notification_groups notification_group join public.admission_notification_group_members member on member.group_id=notification_group.id where notification_group.tribe_id=${fixture.tribeId} and notification_group.recipient_user_id=${fixture.leaderId} group by notification_group.id order by notification_group.id`)).rows);
      expect(group).toHaveLength(1);
      expect(group[0].members).toBe(sourceCount);
      expect(completed.lastCertifiedThroughMicroseconds).toBeLessThan(Number(group[0].closes));
      await fixture.waitUntil(Number(group[0].closes));
      // Clock completion alone never authorizes a partial fresh sweep to freeze the old window.
      await turn();
      const partial = await fixture.repository.readProgress(fixture.tribeId);
      expect(partial).toMatchObject({ version: completed.version + 1, hasContinuation: true, lastCertifiedThroughMicroseconds: completed.lastCertifiedThroughMicroseconds });
      expect(await producer.readReadyGroups(fixture.tribeId)).toEqual([]);
      const certified = await turnUntilSweepComplete();
      expect(certified.version).toBeGreaterThan(partial.version);
      expect(certified.lastCertifiedThroughMicroseconds).toBeGreaterThanOrEqual(Number(group[0].closes));
      expect(await producer.readReadyGroups(fixture.tribeId)).toEqual([{ tribeId: fixture.tribeId, groupId: group[0].id, expectedVersion: 1 }]);
      const prepared = await turn();
      expect(prepared.tribes.find((tribe) => tribe.tribeId === fixture.tribeId)?.preparation).toEqual({ status: "completed", count: 1, code: null });
      const rows = await fixture.execute(async (transaction) => (await transaction.execute<{ frozen_intent: AdmissionNotificationEmailIntent; original_deadline: string; group_deadline: string; deliveries: number; attempts: number }>(sql`select delivery.frozen_intent,delivery.deadline_at::text as original_deadline,notification_group.deadline_at::text as group_deadline,(select count(*)::int from public.message_deliveries where notification_group_id=${group[0].id}) as deliveries,(select count(*)::int from public.message_delivery_attempts where delivery_id=delivery.id) as attempts from public.message_deliveries delivery join public.admission_notification_groups notification_group on notification_group.id=delivery.notification_group_id where delivery.notification_group_id=${group[0].id}`)).rows);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ deliveries: 1, attempts: 0, original_deadline: rows[0].group_deadline });
      expect(rows[0].frozen_intent).toMatchObject({ format: 2, channel: "email", groupId: group[0].id, groupVersion: 2 });
      expect(rows[0].frozen_intent.manifest.items.map((item) => item.obligationId).sort()).toEqual(created.sources.map((source) => source.obligation_id).sort());
      expect(await producer.readReadyGroups(fixture.tribeId)).toEqual([]);
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);
});
