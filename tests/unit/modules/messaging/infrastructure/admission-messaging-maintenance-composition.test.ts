/** @vitest-environment node */
/** Exercises the real maintenance owners and own HTTP contracts without optional keys or provider access. @module admission-messaging-maintenance-composition-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionNotificationReminders } from "@/tests/support/admission-notification-reminder-fixture";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { buildAdmissionMessagingMaintenanceModule } from "@/src/modules/messaging/setup";
import { createAdmissionMessagingMaintenanceHandler } from "@/src/modules/messaging/infrastructure/api/admission-messaging-maintenance-handler";
import { createRequestMessagingMaintenanceAuthorizer } from "@/src/modules/messaging/infrastructure/auth/request-maintenance-authorizer";
import { MessagingCryptographyError } from "@/src/modules/messaging/infrastructure/encryption/messaging-cryptography-error";
import { MESSAGING_CRYPTO_ERROR } from "@/src/modules/messaging/constants/messaging-cryptography";
import type { AdmissionMessagingMaintenanceRuntime } from "@/src/modules/messaging/domain/repositories/admission-messaging-maintenance";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission maintenance composition without optional messaging keys", () => {
  it("should commit internal expiry and unique reminders while exposing unavailable external phases through the real own boundary", async ({ task }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareAdmissionNotificationReminders(database);
      // This reminder fixture intentionally has neither a policy nor a policy snapshot.
      // Reproduce its actual expiration failure before adding the missing current policy.
      await expect(database.withContext(fixture.system, (transaction) => transaction.execute(sql`select public.expire_academy_admission_requests(1)`))).rejects.toMatchObject({ cause: { code: "23502", column: "policy_version" } });
      await database.withContext(fixture.system, (transaction) => transaction.execute(sql`insert into public.academy_admission_policies(tribe_id) values (${fixture.tribeId}),(${fixture.otherTribeId})`));
      const secret = randomUUID(), request = new Request("https://example.invalid/api/maintenance/admission-messaging", { headers: { authorization: `Bearer ${secret}` } });
      const authorize = createRequestMessagingMaintenanceAuthorizer(request, () => secret);
      const retained: Promise<void>[] = [], diagnostics: { operation: string; phase?: string; causes: { name: string | null; code: string | null; constraint: string | null; routine: string | null }[] }[] = [];
      const runtime: AdmissionMessagingMaintenanceRuntime = { now: Date.now, createId: randomUUID, defer: (work) => { retained.push(work); }, report: (error, context) => {
        const causes: { name: string | null; code: string | null; constraint: string | null; routine: string | null }[] = [];
        let cause = error;
        while (cause && typeof cause === "object" && causes.length < 8) {
          causes.push({ name: cause instanceof Error ? cause.name : null, code: "code" in cause && typeof cause.code === "string" ? cause.code : null, constraint: "constraint" in cause && typeof cause.constraint === "string" ? cause.constraint : null, routine: "routine" in cause && typeof cause.routine === "string" ? cause.routine : null });
          cause = "cause" in cause ? cause.cause : null;
        }
        diagnostics.push({ ...context, causes });
      } };
      const createSenders = vi.fn((): never => { throw new Error("A private internal phase must not construct any provider sender"); });
      const maintenance = buildAdmissionMessagingMaintenanceModule({ execute: (actorUserId, run) => database.withContext({ userId: actorUserId, email: null }, run), authorize, readRecoveryLock: async () => false, readExternalScope: async () => null, readSecurityConfig: async (): Promise<never> => { throw new MessagingCryptographyError(MESSAGING_CRYPTO_ERROR.invalidConfiguration); }, publicAppBaseUrl: () => "https://example.invalid", runtime, dispatchRuntime: { now: runtime.now, createId: runtime.createId, defer: runtime.defer, report: () => undefined }, createSenders });
      const handler = createAdmissionMessagingMaintenanceHandler({ authorize: () => authorize(), create: async () => maintenance, diagnostics: () => undefined });
      const response = await handler(request);
      expect(response.status).toBe(503);
      const body = await response.json();
      Object.assign(task.meta, { nativeMaintenanceComposition: { body, diagnostics } });
      expect(body).toMatchObject({ status: "incomplete", newRunStarted: true, deadlineReached: false, observation: "recorded", health: { available: true, lastSuccessfulRunAtMilliseconds: null } });
      expect(body.phases).toHaveLength(7);
      expect(body.phases.find((phase: { phase: string }) => phase.phase === "expire_requests")).toMatchObject({ status: "completed", observation: "recorded", metrics: [{ key: "expired_requests", value: 1 }] });
      expect(body.phases.find((phase: { phase: string }) => phase.phase === "materialize_reminders")).toMatchObject({ status: "completed", observation: "recorded", metrics: [{ key: "created_reminders", value: 2 }] });
      expect(body.phases.find((phase: { phase: string }) => phase.phase === "dispatch_outbox")).toMatchObject({ status: "not_configured", reason: "configuration_unavailable", metrics: [], observation: "recorded" });
      expect(body.phases.find((phase: { phase: string }) => phase.phase === "reconcile_leases")).toMatchObject({ status: "completed", reason: null, metrics: [{ key: "reconciled_leases", value: 0 }], observation: "recorded" });
      expect(createSenders).not.toHaveBeenCalled();
      await Promise.all(retained);
      const persisted = await database.withContext(fixture.system, async (transaction) => (await transaction.execute(sql`select state,deadline_reached,last_successful_at,phases from public.admission_messaging_maintenance_progress where run_id=${body.runId}`)).rows[0]);
      expect(persisted).toMatchObject({ state: "incomplete", deadline_reached: false, last_successful_at: null, phases: body.phases });
      const reminders = await database.withContext(fixture.system, async (transaction) => (await transaction.execute<{ count: string }>(sql`select count(*)::text as count from public.academy_admission_notification_obligations where event_type='reminder' and tribe_id in (${fixture.tribeId},${fixture.otherTribeId})`)).rows[0].count);
      expect(Number(reminders)).toBe(2);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
