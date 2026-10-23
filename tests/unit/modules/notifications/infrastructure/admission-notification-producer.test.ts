/** @vitest-environment node */
/** Exercises real protected producer composition across incremental sweeps and a genuine grouped boundary. @module admission-notification-producer-tests */
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

/** Each source is enqueued for two reviewers, so this many sources give more than 50 references and three source pages. */
const SOURCE_COUNT = 28;
/** Reviewer references per fixture source (the leader and the guardian). */
const REFERENCES_PER_SOURCE = 2;
/** Upper bound of turns for the first sweep: one page per turn, plus pages cut by the soft deadline of a distant database. */
const MAXIMUM_SWEEP_TURNS = 10;
/** Driver ticks allowed between a window's close and its freeze, independently of how many 24-hour sources the tribe has. */
const MAXIMUM_FREEZE_TURNS = 2;

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native protected whole admission notification producer", () => {
  it("should freeze a closed window of more than 50 references within two turns after its close without re-examining them", async () => {
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
        const tribe = result.tribes.find((candidate) => candidate.tribeId === fixture.tribeId);
        expect(tribe).toBeDefined();
        return tribe!;
      };
      await fixture.waitForCollectionWindow();
      const created = await fixture.createSources(SOURCE_COUNT);
      expect(SOURCE_COUNT * REFERENCES_PER_SOURCE).toBeGreaterThan(2 * ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE);
      // The first sweep still examines every 24-hour source, one page per turn.
      let examined = 0;
      for (let turns = 0; ; turns++) {
        if (turns >= MAXIMUM_SWEEP_TURNS) throw new Error("Native producer sweep did not complete within the bounded turns");
        await turn();
        const progress = await fixture.repository.readProgress(fixture.tribeId);
        examined += progress.lastPage!.examined;
        if (!progress.hasContinuation) break;
        expect(await producer.readReadyGroups(fixture.tribeId)).toEqual([]);
      }
      expect(examined).toBeGreaterThanOrEqual(SOURCE_COUNT * REFERENCES_PER_SOURCE);
      const completed = await fixture.repository.readProgress(fixture.tribeId);
      const group = await fixture.execute(async (transaction) => (await transaction.execute<{ id: string; closes: string; members: number }>(sql`select notification_group.id,(extract(epoch from notification_group.window_closes_at)*${MICROSECONDS_PER_SECOND})::bigint::text as closes,count(member.obligation_id)::int as members from public.admission_notification_groups notification_group join public.admission_notification_group_members member on member.group_id=notification_group.id where notification_group.tribe_id=${fixture.tribeId} and notification_group.recipient_user_id=${fixture.leaderId} group by notification_group.id order by notification_group.id`)).rows);
      expect(group).toHaveLength(1);
      expect(group[0].members).toBe(SOURCE_COUNT);
      // A sweep whose horizon precedes the close never certifies the window, even after the clock passes it.
      expect(completed.lastCertifiedThroughMicroseconds).toBeLessThan(Number(group[0].closes));
      await fixture.waitUntil(Number(group[0].closes));
      expect(await producer.readReadyGroups(fixture.tribeId)).toEqual([]);

      // After the close, a new sweep re-examines none of those references, certifies its newer horizon and the next turn freezes.
      let prepared = await turn();
      const certifying = await fixture.repository.readProgress(fixture.tribeId);
      expect(certifying.lastPage).toMatchObject({ examined: 0, sweepComplete: true });
      expect(certifying.lastCertifiedThroughMicroseconds).toBeGreaterThanOrEqual(Number(group[0].closes));
      for (let turns = 1; prepared.preparation.count === 0 && turns < MAXIMUM_FREEZE_TURNS; turns++) prepared = await turn();
      expect(prepared.preparation).toEqual({ status: "completed", count: 1, code: null });
      const rows = await fixture.execute(async (transaction) => (await transaction.execute<{ frozen_intent: AdmissionNotificationEmailIntent; original_deadline: string; group_deadline: string; deliveries: number; attempts: number }>(sql`select delivery.frozen_intent,delivery.deadline_at::text as original_deadline,notification_group.deadline_at::text as group_deadline,(select count(*)::int from public.message_deliveries where notification_group_id=${group[0].id}) as deliveries,(select count(*)::int from public.message_delivery_attempts where delivery_id=delivery.id) as attempts from public.message_deliveries delivery join public.admission_notification_groups notification_group on notification_group.id=delivery.notification_group_id where delivery.notification_group_id=${group[0].id}`)).rows);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ deliveries: 1, attempts: 0, original_deadline: rows[0].group_deadline });
      expect(rows[0].frozen_intent).toMatchObject({ format: 2, channel: "email", groupId: group[0].id, groupVersion: 2 });
      expect(rows[0].frozen_intent.manifest.items.map((item) => item.obligationId).sort()).toEqual(created.sources.map((source) => source.obligation_id).sort());
      expect(await producer.readReadyGroups(fixture.tribeId)).toEqual([]);
    });
  }, ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS);
});
