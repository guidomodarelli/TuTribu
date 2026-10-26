/** @vitest-environment node */
/** Exercises native migration, original acquisition, clocks, fair turns and RLS on disposable databases. @module admission-messaging-maintenance-progress-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { applyAdmissionMigrationJournal } from "@/tests/support/admission-migration-command";
import { ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS } from "@/tests/support/constants/admission-notification-validation";
import { createAdmissionMaintenanceResultFixture } from "@/tests/support/admission-messaging-maintenance-fixture";
import { createUnstartedAdmissionMaintenancePhases } from "@/src/modules/messaging/application/use-cases/admission-messaging-maintenance-state";
import { PostgresAdmissionMessagingMaintenanceProgress, type AdmissionMessagingMaintenanceExecutor } from "@/src/modules/messaging/infrastructure/repositories/postgres-admission-messaging-maintenance-progress";
import { createRequestMessagingMaintenanceAuthorizer } from "@/src/modules/messaging/infrastructure/auth/request-maintenance-authorizer";
import type { AdmissionMessagingMaintenanceExternalScope } from "@/src/modules/messaging/domain/repositories/admission-messaging-maintenance";
import { MILLISECONDS_PER_SECOND } from "@/src/constants/time";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission messaging maintenance progress", () => {
  it("should preserve one original acquisition, rotate phases, retain late evidence and reset health on an actual scope change", async ({ task }) => {
    await withAcademyAdmissionDatabase(async (database) => {
      await applyAdmissionMigrationJournal(database);
      const execute: AdmissionMessagingMaintenanceExecutor = (run) => database.withContext({ userId: null, email: null }, run);
      const secret = randomUUID();
      let currentSecret = secret, recoveryLocked = false;
      let scope: AdmissionMessagingMaintenanceExternalScope | null = null;
      const request = new Request("https://example.invalid/maintenance", { headers: { authorization: `Bearer ${secret}` } });
      const authorize = createRequestMessagingMaintenanceAuthorizer(request, () => currentSecret);
      const progress = new PostgresAdmissionMessagingMaintenanceProgress(execute, authorize, async () => recoveryLocked, async () => scope);
      /** @returns Original persisted metadata; no credentials, contacts or provider fields are read. */
      const metadata = () => execute(async (transaction) => (await transaction.execute<{ version: number; state: string; first_phase: number; next_phase: number; last_successful_at: string | null; deadline_reached: boolean }>(sql`select version,state,first_phase,next_phase,last_successful_at::text,deadline_reached from public.admission_messaging_maintenance_progress`)).rows[0]);
      /** @returns After the original unmodified native deadline; no lease or clock is rewritten. */
      const waitForNativeDeadline = async () => {
        const remaining = await execute(async (transaction) => (await transaction.execute<{ remaining: number }>(sql`select greatest(0,ceil(extract(epoch from deadline_at-clock_timestamp())*${MILLISECONDS_PER_SECOND}))::integer as remaining from public.admission_messaging_maintenance_progress`)).rows[0].remaining);
        await new Promise((resolve) => setTimeout(resolve, remaining));
      };
      const first = await progress.begin(randomUUID());
      expect(first.acquired).toBe(true);
      if (!first.acquired) throw new Error("Original native acquisition was not confirmed");
      expect(first.run).toMatchObject({ firstPhaseIndex: 0, externalScope: null, health: { available: true, lastSuccessfulRunAtMilliseconds: null } });
      await progress.assertRunnable(first.run);
      const acquiredMetadata = await metadata();
      expect(await progress.begin(randomUUID())).toMatchObject({ acquired: false, existingRunId: first.run.runId, existingStatus: "busy" });
      expect(await progress.begin(first.run.runId)).toMatchObject({ acquired: false, existingRunId: first.run.runId });
      expect(await metadata()).toEqual(acquiredMetadata);
      const phases = createAdmissionMaintenanceResultFixture().phases;
      for (const phase of phases) {
        await progress.recordPhase(first.run, { ...phase, status: "running", metrics: [] });
        await progress.recordPhase(first.run, phase);
      }
      const completed = await progress.finish(first.run, phases, false);
      Object.assign(task.meta, { nativeMaintenanceProgress: { completed, stored: await metadata() } });
      expect(completed).toMatchObject({ completed: true, deadlineReached: false, health: { available: true, oldestQueuedAtMilliseconds: null, queueAgeMilliseconds: null } });
      expect(completed.health.lastSuccessfulRunAtMilliseconds).not.toBeNull();
      const originalSuccess = await metadata();
      await progress.recordPhase(first.run, phases[0]);
      expect(await metadata()).toEqual(originalSuccess);
      await waitForNativeDeadline();
      expect(await progress.begin(first.run.runId)).toMatchObject({ acquired: false, existingStatus: "completed", deadlineReached: false });
      expect(await metadata()).toEqual(originalSuccess);
      expect(await progress.finish(first.run, phases, false)).toEqual(expect.objectContaining({ completed: true }));
      expect(await metadata()).toEqual(originalSuccess);
      const second = await progress.begin(randomUUID());
      expect(second.acquired).toBe(true);
      if (!second.acquired) throw new Error("Second native acquisition was not confirmed");
      expect(second.run.firstPhaseIndex).toBe(1);
      expect(second.run.health.lastSuccessfulRunAtMilliseconds).toBe(completed.health.lastSuccessfulRunAtMilliseconds);
      const deadline = await progress.finish(second.run, phases, false, 0);
      expect(deadline).toMatchObject({ completed: false, deadlineReached: true, health: { lastSuccessfulRunAtMilliseconds: completed.health.lastSuccessfulRunAtMilliseconds } });
      await expect(progress.assertRunnable(second.run)).rejects.toMatchObject({ reason: "operation_unresolved" });
      const third = await progress.begin(randomUUID());
      if (!third.acquired) throw new Error("Third native acquisition was not confirmed");
      expect(third.run.firstPhaseIndex).toBe(2);
      const unresolved = createUnstartedAdmissionMaintenancePhases().map((phase, index) => index === 0 ? { ...phase, status: "unresolved" as const, observation: "recorded" as const, reason: "deadline_reached" as const } : phase);
      await progress.finish(third.run, unresolved, true);
      await progress.recordPhase(third.run, { ...phases[0], metrics: [{ key: "expired_requests", value: 1 }], late: true });
      expect(await metadata()).toMatchObject({ state: "incomplete", deadline_reached: true, last_successful_at: originalSuccess.last_successful_at });
      const late = await progress.begin(third.run.runId);
      expect(late).toMatchObject({ acquired: false, existingStatus: "incomplete" });
      if (late.acquired) throw new Error("Original late evidence unexpectedly became another acquisition");
      expect(late.phases[0]).toMatchObject({ late: true, metrics: [{ key: "expired_requests", value: 1 }], observation: "recorded" });
      const fourth = await progress.begin(randomUUID());
      if (!fourth.acquired) throw new Error("Fourth native acquisition was not confirmed");
      scope = { environment: randomUUID(), securityEpoch: randomUUID() };
      const changed = await progress.begin(randomUUID());
      if (!changed.acquired) throw new Error("Changed native scope did not replace its old lease");
      expect(changed.run.health.lastSuccessfulRunAtMilliseconds).toBeNull();
      expect(changed.run.firstPhaseIndex).toBe(4);
      await expect(progress.assertRunnable(fourth.run)).rejects.toMatchObject({ reason: "recovery_locked" });
      await expect(progress.recordPhase(fourth.run, phases[0])).rejects.toMatchObject({ reason: "recovery_locked" });
      const beforeDenied = await metadata();
      recoveryLocked = true;
      await expect(progress.begin(randomUUID())).rejects.toMatchObject({ reason: "recovery_locked" });
      recoveryLocked = false;
      currentSecret = randomUUID();
      await expect(progress.begin(randomUUID())).rejects.toMatchObject({ reason: "authority_unavailable" });
      expect(await metadata()).toEqual(beforeDenied);
      currentSecret = secret;
      await database.grantTablesToNonBypass(["admission_messaging_maintenance_progress"]);
      expect(await database.withContext({ userId: randomUUID(), email: null }, async (transaction) => (await transaction.execute(sql`select scope from public.admission_messaging_maintenance_progress`)).rows, "non_bypass")).toEqual([]);
      await expect(database.withContext({ userId: randomUUID(), email: null }, (transaction) => transaction.execute(sql`update public.admission_messaging_maintenance_progress set version=version+1 where scope='admission_messaging' returning scope`), "non_bypass")).resolves.toMatchObject({ rowCount: 0 });
      const storage = await execute(async (transaction) => (await transaction.execute(sql`select relrowsecurity,relforcerowsecurity from pg_class where oid='public.admission_messaging_maintenance_progress'::regclass`)).rows[0]);
      expect(storage).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
      const beforeNativeDeadline = await metadata();
      await waitForNativeDeadline();
      expect(await progress.begin(randomUUID())).toMatchObject({ acquired: false, existingRunId: changed.run.runId, existingStatus: "busy", deadlineReached: true });
      expect(await metadata()).toEqual(beforeNativeDeadline);
    });
  }, ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS);
});
