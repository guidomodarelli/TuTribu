/** @vitest-environment node */
/** Exercises the full maintenance workflow with the genuine SDK behind a closed transport and original late receipt persistence. @module admission-messaging-maintenance-dispatch-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareContactVerificationIssuer } from "@/tests/support/contact-verification-issuance-fixture";
import { createAdmissionProviderTransport } from "@/tests/support/admission-provider-transport";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { buildAdmissionMessagingMaintenanceModule } from "@/src/modules/messaging/setup";
import { createRegisteredMessagingAdapters } from "@/src/modules/messaging/infrastructure/composition/messaging-provider-adapters";
import { createAdmissionNotificationResourceAuthority } from "@/src/modules/notifications/infrastructure/messaging/admission-notification-resource-authority";
import { createRequestMessagingMaintenanceAuthorizer } from "@/src/modules/messaging/infrastructure/auth/request-maintenance-authorizer";
import { PostgresAdmissionMessagingMaintenanceProgress } from "@/src/modules/messaging/infrastructure/repositories/postgres-admission-messaging-maintenance-progress";
import { createUnstartedAdmissionMaintenancePhases } from "@/src/modules/messaging/application/use-cases/admission-messaging-maintenance-state";
import { ZAVU_DELIVERY_ENDPOINT } from "@/src/modules/messaging/constants/zavu-delivery";
import { ADMISSION_MESSAGING_MAINTENANCE_PHASE, ADMISSION_MESSAGING_MAINTENANCE_PHASES } from "@/src/modules/messaging/constants/admission-messaging-maintenance";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";
import { MILLISECONDS_PER_SECOND } from "@/src/constants/time";
import type { AdmissionMessagingMaintenanceRuntime } from "@/src/modules/messaging/domain/repositories/admission-messaging-maintenance";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native full admission maintenance SDK dispatch", () => {
  it("should retain one original SDK receipt after the native maintenance window closes and block new work without another send", async ({ task }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareContactVerificationIssuer(database);
      const firstIssued = await fixture.issue();
      if (firstIssued.state !== "completed" || firstIssued.result.outcome !== "issued") throw new Error("Native maintenance did not receive its original issued verification delivery");
      const firstDeliveryId = firstIssued.result.deliveryId;
      const secret = randomUUID(), request = new Request("https://example.invalid/maintenance", { headers: { authorization: `Bearer ${secret}` } });
      const authorize = createRequestMessagingMaintenanceAuthorizer(request, () => secret);
      const scope = { environment: fixture.config.environment, securityEpoch: fixture.config.securityEpoch };
      const retained: Promise<void>[] = [];
      const runtime: AdmissionMessagingMaintenanceRuntime = { now: Date.now, createId: randomUUID, defer: (work) => { retained.push(work); }, report: () => undefined };
      const progress = new PostgresAdmissionMessagingMaintenanceProgress((run) => database.withContext({ userId: null, email: null }, run), authorize, async () => false, async () => scope);
      const currentDeliveryId = firstDeliveryId;
      // A previous incomplete invocation advances one genuine native turn. No stored
      // clock, lease, phase index, production limit or business effect is rewritten.
      const dispatchTurn = ADMISSION_MESSAGING_MAINTENANCE_PHASES.indexOf(ADMISSION_MESSAGING_MAINTENANCE_PHASE.dispatch);
      for (let turn = 0; turn < dispatchTurn; turn += 1) {
        const prior = await progress.begin(randomUUID());
        if (!prior.acquired) throw new Error("Previous incomplete native turn was not acquired");
        await progress.finish(prior.run, createUnstartedAdmissionMaintenancePhases(), false);
      }
      const locks: { delivery: boolean; maintenance: boolean }[] = [];
      const transport = createAdmissionProviderTransport([{ origin: ZAVU_DELIVERY_ENDPOINT.origin, pathname: ZAVU_DELIVERY_ENDPOINT.path, method: "POST", respond: async () => {
        const unlocked = await database.withContext({ userId: null, email: null }, async (transaction) => {
          const delivery = (await transaction.execute(sql`select id from public.message_deliveries where id=${currentDeliveryId} for update nowait`)).rows.length === 1;
          const maintenance = (await transaction.execute(sql`select scope from public.admission_messaging_maintenance_progress for update nowait`)).rows.length === 1;
          return { delivery, maintenance };
        });
        locks.push(unlocked);
        {
          const original = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ run_id: string; first_phase: number; started: string }>(sql`select run_id,first_phase,(extract(epoch from started_at)*${MILLISECONDS_PER_SECOND})::bigint::text as started from public.admission_messaging_maintenance_progress`)).rows[0]);
          const busy = await progress.begin(original.run_id);
          if (busy.acquired) throw new Error("Original in-flight native acquisition was replaced");
          const stopped = await progress.finish({ runId: original.run_id, startedAtMilliseconds: Number(original.started), firstPhaseIndex: original.first_phase, externalScope: scope, health: busy.health }, createUnstartedAdmissionMaintenancePhases(), true, 0);
          expect(stopped).toMatchObject({ completed: false, deadlineReached: true });
        }
        return Response.json({ message: { id: randomUUID(), direction: "outbound", channel: "email", status: "queued" } });
      } }]);
      const readSecurityConfig = async () => fixture.config;
      const maintenance = buildAdmissionMessagingMaintenanceModule({ execute: (actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run), authorize, readRecoveryLock: async () => false, readExternalScope: async () => scope, readSecurityConfig, publicAppBaseUrl: () => "https://example.invalid", runtime, dispatchRuntime: { now: runtime.now, createId: runtime.createId, defer: runtime.defer, report: () => undefined }, createSenders: (execute) => {
        const adapters = createRegisteredMessagingAdapters({ execute: (context, run) => {
          if (context.authorizationPurpose !== MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery) throw new Error("Maintenance provider lookup received a human-session context");
          return execute(context.contributingLeaderUserId, run);
        }, readSecurityFacts: async () => ({ ...scope, recoveryLocked: false }), fetch: transport.fetch, authorizeDeliveryResource: createAdmissionNotificationResourceAuthority(readSecurityConfig).marked });
        return { createSender: adapters.createSender, createNotificationSender: adapters.createNotificationSender };
      } });
      const result = await maintenance.useCases.runMaintenance.execute();
      for (let index = 0; index < retained.length; index += 1) await retained[index];
      Object.assign(task.meta, { nativeMaintenance: { result, transport: transport.receipts, locks } });
      expect(result.status).toBe("incomplete");
      expect(result.phases.find((phase) => phase.phase === "dispatch_outbox")?.metrics).toContainEqual({ key: "accepted_deliveries", value: 1 });
      expect(transport.receipts).toHaveLength(1);
      const originalReceipts = await database.withContext({ userId: null, email: null }, async (transaction) => (await transaction.execute<{ id: string; state: string; attempts: number; reservations: number }>(sql`select delivery.id,delivery.state,(select count(*)::int from public.message_delivery_attempts attempt where attempt.delivery_id=delivery.id) as attempts,(select count(*)::int from public.messaging_usage_reservations reservation where reservation.delivery_id=delivery.id) as reservations from public.message_deliveries delivery where delivery.id in (${firstDeliveryId},${currentDeliveryId}) order by delivery.id`)).rows);
      expect(originalReceipts).toEqual([{ id: firstDeliveryId, state: "accepted", attempts: 1, reservations: 1 }]);
      expect(locks).toEqual([{ delivery: true, maintenance: true }]);
      expect(transport.deniedRequests).toBe(0);
      const original = await progress.begin(result.runId!);
      expect(original).toMatchObject({ acquired: false, existingStatus: "incomplete", deadlineReached: true, health: { lastSuccessfulRunAtMilliseconds: null, oldestQueuedAtMilliseconds: null, queueAgeMilliseconds: null } });
      if (original.acquired) throw new Error("A late receipt unexpectedly started another original run");
      await expect(progress.assertRunnable({ runId: result.runId!, startedAtMilliseconds: 0, firstPhaseIndex: dispatchTurn, externalScope: scope, health: original.health })).rejects.toMatchObject({ reason: "operation_unresolved" });
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
