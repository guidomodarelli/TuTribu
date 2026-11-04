/** @vitest-environment node */
/** Exercises real owner adapters behind a host guard that rejects inside their transaction, with a controlled clock crossing the phase deadline. @module admission-messaging-maintenance-guard-classification-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { OriginalAdmissionMessagingMaintenanceWork, classifyAdmissionMaintenanceProducerStop, type AdmissionMessagingMaintenanceOwners } from "@/src/modules/messaging/infrastructure/composition/admission-messaging-maintenance-work";
import { AdmissionMessagingMaintenanceError } from "@/src/modules/messaging/domain/errors/admission-messaging-maintenance-error";
import { PostgresAdmissionRequestExpiration } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-request-expiration";
import { PostgresAdmissionRetentionRepository } from "@/src/modules/academy-admissions/infrastructure/repositories/postgres-admission-retention-repository";
import { PostgresAdmissionNotificationProducer } from "@/src/modules/notifications/infrastructure/repositories/postgres-admission-notification-producer";
import { PrepareAdmissionEmailNotificationsUseCase } from "@/src/modules/notifications/application/use-cases/prepare-admission-email-notifications-use-case";
import { createAdmissionMaintenanceResultFixture } from "@/tests/support/admission-messaging-maintenance-fixture";
import type { AdmissionMessagingMaintenancePhase, AdmissionMessagingMaintenanceReason } from "@/src/modules/messaging/domain/repositories/admission-messaging-maintenance";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionNotificationCollectionProgress } from "@/src/modules/notifications/domain/repositories/admission-notification-collection-progress";
import type { AdmissionNotificationGroupPreparation } from "@/src/modules/notifications/domain/repositories/admission-notification-group-preparation";

/** Hard run deadline on the controlled clock. */
const HARD_DEADLINE_MS = 10_000;
/** Soft phase deadline: owners start no new step after it. */
const PHASE_DEADLINE_MS = 5_000;
/** Time a transaction spends in checkout, BEGIN and the lease read before the host guard samples the clock again. */
const GUARD_CHECK_DELAY_MS = 2;

/**
 * @param stop - Guard reason raised inside the owner transaction once the clock reaches the phase deadline, or a non-guard failure.
 * @param startAtMilliseconds - Initial controlled time; by default just before the phase deadline.
 * @returns A controlled clock and a guarded executor that, like the host composition, samples the clock
 * after the transaction opens and rejects before the owner's work runs.
 */
function guardedHost(stop: AdmissionMessagingMaintenanceReason | Error, startAtMilliseconds = PHASE_DEADLINE_MS - 1) {
  let now = startAtMilliseconds;
  const work = vi.fn();
  const execute = async <Result>(run: (database: RequestDatabase) => Promise<Result>): Promise<Result> => {
    now += GUARD_CHECK_DELAY_MS;
    if (stop instanceof Error) throw stop;
    if (now >= PHASE_DEADLINE_MS) throw new AdmissionMessagingMaintenanceError(stop);
    work();
    return run({} as RequestDatabase);
  };
  return { execute, work, now: () => now };
}

/**
 * @param host - Guarded host of the phase.
 * @param owners - Real owners bound to that host for the phases under test.
 * @returns The real phase adapter and its private report sink.
 */
function maintenanceWork(host: ReturnType<typeof guardedHost>, owners: Partial<AdmissionMessagingMaintenanceOwners>) {
  const report = vi.fn();
  const unexpected = async (): Promise<never> => { throw new Error("This phase is not under test"); };
  const allOwners: AdmissionMessagingMaintenanceOwners = { expireRequests: unexpected, purgeAdmission: unexpected, purgeMessaging: unexpected, materializeReminders: unexpected, prepareNotifications: unexpected, dispatchOutbox: unexpected, reconcileLeases: unexpected, ...owners };
  const work = new OriginalAdmissionMessagingMaintenanceWork(() => allOwners, async () => { throw new Error("No phase under test reads security configuration"); }, { now: host.now, createId: randomUUID, defer: () => undefined, report });
  const result = createAdmissionMaintenanceResultFixture(), run = { runId: result.runId!, startedAtMilliseconds: 0, firstPhaseIndex: 0, externalScope: null, health: result.health };
  const execute = (phase: AdmissionMessagingMaintenancePhase) => work.runPhase({ phase, deadlineAtMilliseconds: HARD_DEADLINE_MS, signal: new AbortController().signal, run, phaseDeadlineAtMilliseconds: PHASE_DEADLINE_MS });
  return { execute, report };
}

/**
 * @param host - Guarded host of the notifications phase.
 * @param authorized - Current producer job authority.
 * @returns The real producer use case over the real guarded producer adapter, with unreachable later ports and its report sink.
 */
function notificationProducer(host: ReturnType<typeof guardedHost>, authorized = true) {
  const report = vi.fn();
  const unreachable = async (): Promise<never> => { throw new Error("The guard stops the selection before this port"); };
  const progress: AdmissionNotificationCollectionProgress = { readProgress: unreachable, collectPage: unreachable };
  const preparation: AdmissionNotificationGroupPreparation = { prepare: unreachable };
  const producer = new PostgresAdmissionNotificationProducer(host.execute, async () => authorized, async () => false);
  const useCase = new PrepareAdmissionEmailNotificationsUseCase(producer, progress, preparation, { now: host.now, createId: randomUUID, report, classifyStop: classifyAdmissionMaintenanceProducerStop });
  return { useCase, producer, report };
}

describe("maintenance guard rejections behind owner wrappers", () => {
  it("should report expiration as not run when the deadline passes between the phase check and the guard inside its transaction", async () => {
    const host = guardedHost("deadline_reached");
    const test = maintenanceWork(host, { expireRequests: async () => ({ expired: await new PostgresAdmissionRequestExpiration(host.execute, async () => true).expire({ limit: 1 }) }) });
    expect(await test.execute("expire_requests")).toEqual({ status: "not_run", reason: "deadline_reached", metrics: [], hasRemainingWork: true });
    expect(host.work).not.toHaveBeenCalled();
    expect(test.report).toHaveBeenCalledWith(expect.objectContaining({ name: "AdmissionExpirationError", code: "operation_unresolved", cause: expect.objectContaining({ code: "deadline_reached" }) }), expect.objectContaining({ phase: "expire_requests" }));
  });

  it("should report a lost lease authority in retention as a definitive authority failure that stops the run", async () => {
    const host = guardedHost("authority_unavailable");
    const test = maintenanceWork(host, { purgeAdmission: () => new PostgresAdmissionRetentionRepository(host.execute, async () => true, async () => false).purge({ importRowLimit: 1, requestLimit: 1, auditLimit: 1 }) });
    expect(await test.execute("purge_admission")).toEqual({ status: "failed", reason: "authority_unavailable", metrics: [], hasRemainingWork: true });
  });

  it("should keep a failure without a guard behind it uncertain", async () => {
    const host = guardedHost(new Error("commit response lost"));
    const test = maintenanceWork(host, { expireRequests: async () => ({ expired: await new PostgresAdmissionRequestExpiration(host.execute, async () => true).expire({ limit: 1 }) }) });
    expect(await test.execute("expire_requests")).toEqual({ status: "unresolved", reason: "operation_unresolved", metrics: [], hasRemainingWork: true });
  });

  it("should recognize the reminder owner's own authority rejection instead of calling it unresolved", async () => {
    const host = guardedHost("deadline_reached", 0);
    const { producer } = notificationProducer(host, false);
    const test = maintenanceWork(host, { materializeReminders: async () => ({ created: await producer.materializeReminders() }) });
    expect(await test.execute("materialize_reminders")).toEqual({ status: "failed", reason: "authority_unavailable", metrics: [], hasRemainingWork: true });
  });

  it("should defer the notifications phase as budget-only when the guard stops the next step after the use case checked the deadline", async () => {
    const host = guardedHost("deadline_reached"), { useCase, report } = notificationProducer(host);
    const result = await useCase.prepareGroups(PHASE_DEADLINE_MS);
    expect(result).toMatchObject({ selection: { status: "not_run", count: 0, code: null }, tribes: [], stoppedAtDeadline: true });
    expect(report).not.toHaveBeenCalled();
    const test = maintenanceWork(host, { prepareNotifications: async () => result });
    expect(await test.execute("prepare_notifications")).toMatchObject({ status: "deferred", reason: "deadline_reached", hasRemainingWork: true });
  });

  it("should fail the notifications phase on a lost lease authority instead of leaving it uncertain", async () => {
    const host = guardedHost("authority_unavailable"), { useCase, report } = notificationProducer(host);
    const result = await useCase.prepareGroups(HARD_DEADLINE_MS);
    expect(result.selection).toEqual({ status: "failed", count: 0, code: "permission_denied" });
    expect(report).toHaveBeenCalledTimes(1);
    const test = maintenanceWork(host, { prepareNotifications: async () => result });
    expect(await test.execute("prepare_notifications")).toMatchObject({ status: "failed", reason: "authority_unavailable" });
  });
});
