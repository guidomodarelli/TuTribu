/** Exercises real producer orchestration through its own effect ports and unchanged host deadlines. @module prepare-admission-email-notifications-tests */
import { describe, expect, it, vi } from "vitest";
import { PrepareAdmissionEmailNotificationsUseCase } from "@/src/modules/notifications/application/use-cases/prepare-admission-email-notifications-use-case";
import type { AdmissionNotificationCollectionPageResult, AdmissionNotificationCollectionProgressSnapshot } from "@/src/modules/notifications/domain/repositories/admission-notification-collection-progress";
import type { AdmissionNotificationGroupPreparation } from "@/src/modules/notifications/domain/repositories/admission-notification-group-preparation";
import type { AdmissionNotificationProducer } from "@/src/modules/notifications/domain/repositories/admission-notification-producer";
import { ADMISSION_NOTIFICATION_PRODUCER_LIMITS } from "@/src/modules/notifications/constants/admission-notification-producer";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE } from "@/src/modules/notifications/constants/admission-notification-source-selection";
import { MILLISECONDS_PER_SECOND, SECONDS_PER_MINUTE } from "@/src/constants/time";

/** One maintenance driver tick, as scheduled in the pilot. */
const DRIVER_TICK_MS = SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
/** Host run budget of one tick; the simulated clock only moves between ticks, so runs never reach it. */
const RUN_BUDGET_MS = 45 * MILLISECONDS_PER_SECOND;
/** Pilot measurement of 2026-10-22: 54 sources of 24 hours, three pages per full sweep. */
const PILOT_SOURCE_COUNT = 54;
/** Tick whose middle closes the simulated grouped window, between two driver runs as in SC-015. */
const WINDOW_CLOSE_TICK = 5;
/** Last simulated tick, well past the old `2S` delay. */
const LAST_SIMULATED_TICK = 15;
/** Freeze bound after the close, in driver ticks, required independently of the 24-hour source count. */
const MAXIMUM_FREEZE_TICKS = 2;
/** New sources arriving between two driver ticks during the simulation. */
const NEW_SOURCES_PER_TICK = 2;

/**
 * Models the persisted certification contract tick by tick: a sweep certifies the horizon it started with once its last page
 * completes, and a window freezes once that certificate and the clock both reach its close. A full sweep re-examines every 24-hour
 * source (the former adapter); an incremental sweep reads only the sources after its frontier. Both start in steady state, with
 * every existing source already examined by an earlier sweep, and receive a few new sources per tick.
 * @param initialSourceCount - 24-hour sources of the tenant. @param incremental - Whether a new sweep starts after the frontier.
 * @returns The real use case driven tick by tick, with the instant the window froze.
 */
function certificationSimulation(initialSourceCount: number, incremental: boolean) {
  let now = 0, version = 0, examinedInSweep: number | null = null, sourceCount = initialSourceCount, frontier = initialSourceCount, horizon = 0, certifiedThrough: number | null = null, frozenAt: number | null = null, identity = 0;
  const closesAt = WINDOW_CLOSE_TICK * DRIVER_TICK_MS + DRIVER_TICK_MS / 2;
  const producer: AdmissionNotificationProducer = {
    selectNextTribe: async (excluded) => excluded.length ? null : "tribe",
    readReadyGroups: async (tribeId) => frozenAt === null && certifiedThrough !== null && closesAt <= certifiedThrough && closesAt <= now ? [{ tribeId, groupId: "grouped", expectedVersion: 1 }] : [],
    materializeReminders: async () => 0,
  };
  const progress = {
    readProgress: async (tribeId: string): Promise<AdmissionNotificationCollectionProgressSnapshot> => ({ tribeId, version, hasContinuation: examinedInSweep !== null, lastPage: null, lastSweepCompletedAtMicroseconds: null, lastCertifiedThroughMicroseconds: null }),
    collectPage: async (command: { tribeId: string; operationId: string; expectedVersion: number }): Promise<AdmissionNotificationCollectionPageResult> => {
      if (examinedInSweep === null) { examinedInSweep = 0; horizon = now; }
      const due = incremental ? sourceCount - frontier : sourceCount;
      const examined = Math.min(ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE, due - examinedInSweep);
      examinedInSweep += examined;
      const sweepComplete = examinedInSweep >= due;
      if (sweepComplete) { certifiedThrough = horizon; frontier = sourceCount; examinedInSweep = null; }
      return { ...command, previousVersion: version, version: ++version, examined, collected: 0, existing: examined, suppressed: 0, unavailable: 0, bucketClosed: 0, sweepComplete, completedAtMicroseconds: now, sourceThroughMicroseconds: horizon, sweepHadUnavailable: false, replayed: false };
    },
  };
  const preparation: AdmissionNotificationGroupPreparation = { prepare: async (command) => { frozenAt = now; return { groupId: command.groupId, groupVersion: 2, status: "queued", deliveryId: command.groupId, reason: null, replayed: false }; } };
  const useCase = new PrepareAdmissionEmailNotificationsUseCase(producer, progress, preparation, { now: () => now, createId: () => `page-${identity++}`, report: () => {} });
  return {
    closesAt,
    /** @returns The freeze instant after running driver ticks until it happens, or null when it never did. */
    runUntilFrozen: async () => {
      for (let tickIndex = 0; tickIndex <= LAST_SIMULATED_TICK && frozenAt === null; tickIndex++) { now = tickIndex * DRIVER_TICK_MS; sourceCount += NEW_SOURCES_PER_TICK; await useCase.prepareGroups(now + RUN_BUDGET_MS); }
      return frozenAt;
    },
  };
}

/** @returns Cohesive fakes of the application's own ports, without mocking a platform library or adapter. */
function fixture() {
  let now = 0, identity = 0;
  const producer = {
    selectNextTribe: vi.fn<AdmissionNotificationProducer["selectNextTribe"]>().mockResolvedValue(null),
    readReadyGroups: vi.fn<AdmissionNotificationProducer["readReadyGroups"]>().mockResolvedValue([]),
    materializeReminders: vi.fn<AdmissionNotificationProducer["materializeReminders"]>().mockResolvedValue(0),
  };
  const progress = {
    readProgress: vi.fn(async (tribeId: string): Promise<AdmissionNotificationCollectionProgressSnapshot> => ({ tribeId, version: 0, hasContinuation: false, lastPage: null, lastSweepCompletedAtMicroseconds: null, lastCertifiedThroughMicroseconds: null })),
    collectPage: vi.fn(async (command: { tribeId: string; operationId: string; expectedVersion: number }): Promise<AdmissionNotificationCollectionPageResult> => ({ ...command, previousVersion: command.expectedVersion, version: command.expectedVersion + 1, examined: 1, collected: 1, existing: 0, suppressed: 0, unavailable: 0, bucketClosed: 0, sweepComplete: true, completedAtMicroseconds: 1, sourceThroughMicroseconds: 1, sweepHadUnavailable: false, replayed: false })),
  };
  const preparation = { prepare: vi.fn<AdmissionNotificationGroupPreparation["prepare"]>().mockImplementation(async (command) => ({ groupId: command.groupId, groupVersion: command.expectedVersion + 1, status: "queued", deliveryId: command.groupId, reason: null, replayed: false })) };
  const runtime = { now: () => now, createId: vi.fn(() => `page-${identity++}`), report: vi.fn() };
  const useCase = new PrepareAdmissionEmailNotificationsUseCase(producer, progress, preparation, runtime);
  return { producer, progress, preparation, runtime, useCase, advanceToDeadline: () => { now = MILLISECONDS_PER_SECOND; }, deadline: MILLISECONDS_PER_SECOND };
}

describe("bounded complete admission email producer", () => {
  it("should give distinct tenants one original page each and prepare only backend-selected original groups", async () => {
    const test = fixture();
    test.producer.selectNextTribe.mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    test.producer.readReadyGroups.mockImplementation(async (tribeId) => [{ tribeId, groupId: `${tribeId}-group`, expectedVersion: 1 }]);
    const result = await test.useCase.execute(test.deadline);
    expect(test.producer.selectNextTribe.mock.calls).toEqual([[[]], [["first"]], [["first", "second"]]]);
    expect(test.progress.collectPage.mock.calls).toEqual([[{ tribeId: "first", operationId: "page-0", expectedVersion: 0, softDeadlineAtMilliseconds: test.deadline }], [{ tribeId: "second", operationId: "page-1", expectedVersion: 0, softDeadlineAtMilliseconds: test.deadline }]]);
    expect(result.tribes.map((tribe) => tribe.preparation)).toEqual([{ status: "completed", count: 1, code: null }, { status: "completed", count: 1, code: null }]);
    expect(result).toMatchObject({ stoppedAtDeadline: false, limitReached: false, reminders: { status: "completed" } });
    expect(test.runtime.report).not.toHaveBeenCalled();
  });

  it("should retain confirmed reminders and earlier groups when later original preparation becomes unresolved", async () => {
    const test = fixture();
    test.producer.materializeReminders.mockResolvedValue(1);
    test.producer.selectNextTribe.mockResolvedValueOnce("first");
    test.producer.readReadyGroups.mockResolvedValue([{ tribeId: "first", groupId: "one", expectedVersion: 1 }, { tribeId: "first", groupId: "two", expectedVersion: 1 }]);
    const cause = new Error("Synthetic native commit completion is unavailable");
    test.preparation.prepare.mockResolvedValueOnce({ groupId: "one", groupVersion: 2, status: "queued", deliveryId: "original", reason: null, replayed: false }).mockRejectedValueOnce(new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved, { cause }));
    const result = await test.useCase.execute(test.deadline);
    expect(result.reminders).toEqual({ status: "completed", count: 1, code: null });
    expect(result.tribes[0]).toMatchObject({ groupsExamined: 1, preparation: { status: "unresolved", count: 1, code: "operation_unresolved" } });
    expect(test.preparation.prepare).toHaveBeenCalledTimes(2);
    expect(test.runtime.report).toHaveBeenCalledWith(expect.objectContaining({ cause }), { phase: "preparation", tribeId: "first" });
  });

  it("should preserve an unresolved page identity without a blind retry and continue another fair tenant", async () => {
    const test = fixture();
    test.producer.selectNextTribe.mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    test.progress.collectPage.mockRejectedValueOnce(new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved));
    const result = await test.useCase.execute(test.deadline);
    expect(result.tribes[0]).toMatchObject({ operationId: "page-0", collection: { status: "unresolved", count: 0 }, preparation: { status: "completed", count: 0 } });
    expect(result.tribes[1]).toMatchObject({ operationId: "page-1", collection: { status: "completed" } });
    expect(test.producer.readReadyGroups.mock.calls).toEqual([["first"], ["second"]]);
    expect(test.progress.collectPage).toHaveBeenCalledTimes(2);
  });

  it("should stop before new effects when the unchanged host deadline expires during a metadata read", async () => {
    const test = fixture();
    test.producer.selectNextTribe.mockResolvedValueOnce("first");
    test.progress.readProgress.mockImplementationOnce(async (tribeId) => { test.advanceToDeadline(); return { tribeId, version: 0, hasContinuation: false, lastPage: null, lastSweepCompletedAtMicroseconds: null, lastCertifiedThroughMicroseconds: null }; });
    expect(await test.useCase.execute(test.deadline)).toMatchObject({ stoppedAtDeadline: true, tribes: [{ operationId: null, collection: { status: "not_run" }, preparation: { status: "completed", count: 0 } }] });
    expect(test.runtime.createId).not.toHaveBeenCalled();
    expect(test.progress.collectPage).not.toHaveBeenCalled();
    expect(test.producer.readReadyGroups).toHaveBeenCalledExactlyOnceWith("first");
    expect(test.preparation.prepare).not.toHaveBeenCalled();
  });

  it("should expose unavailable email work while retaining independent internal reminder completion", async () => {
    const test = fixture();
    test.producer.materializeReminders.mockResolvedValue(1);
    test.producer.selectNextTribe.mockResolvedValueOnce("first");
    test.progress.collectPage.mockRejectedValueOnce(new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete));
    const result = await test.useCase.execute(test.deadline);
    expect(result.reminders).toEqual({ status: "completed", count: 1, code: null });
    expect(result.tribes[0].collection).toEqual({ status: "failed", count: 0, code: "connection_incomplete" });
    expect(test.producer.readReadyGroups).toHaveBeenCalledExactlyOnceWith("first");
  });

  it("should respect the tenant bound even when more locators remain and never count a recovered original twice", async () => {
    const test = fixture();
    test.producer.selectNextTribe.mockImplementation(async (excluded) => `tenant-${excluded.length}`);
    test.producer.readReadyGroups.mockImplementation(async (tribeId) => [{ tribeId, groupId: tribeId, expectedVersion: 1 }]);
    test.preparation.prepare.mockImplementation(async (command) => ({ groupId: command.groupId, groupVersion: 2, status: "queued", deliveryId: "already-confirmed", reason: null, replayed: true }));
    const result = await test.useCase.execute(test.deadline);
    expect(result).toMatchObject({ limitReached: true });
    expect(result.tribes).toHaveLength(ADMISSION_NOTIFICATION_PRODUCER_LIMITS.tribes);
    expect(test.progress.collectPage).toHaveBeenCalledTimes(ADMISSION_NOTIFICATION_PRODUCER_LIMITS.tribes);
    expect(result.tribes.every((tribe) => tribe.preparation.count === 0)).toBe(true);
  });

  it("should retain a prior unavailable page as deferred even when the latest page has no individual failure", async () => {
    const test = fixture();
    test.producer.selectNextTribe.mockResolvedValueOnce("first");
    const collect = test.progress.collectPage.getMockImplementation()!;
    test.progress.collectPage.mockImplementationOnce(async (command) => ({ ...await collect(command), sweepHadUnavailable: true, sweepComplete: false }));
    const result = await test.useCase.execute(test.deadline);
    expect(result.tribes[0]).toMatchObject({ collection: { status: "deferred", count: 1, code: "connection_incomplete" }, hasContinuation: true });
  });

  it("should leave every phase visibly unstarted when the original deadline has already elapsed", async () => {
    const test = fixture();
    test.advanceToDeadline();
    expect(await test.useCase.execute(test.deadline)).toMatchObject({ reminders: { status: "not_run", count: 0 }, selection: { status: "not_run", count: 0 }, tribes: [], stoppedAtDeadline: true });
    expect(test.producer.materializeReminders).not.toHaveBeenCalled();
    expect(test.producer.selectNextTribe).not.toHaveBeenCalled();
    expect(test.progress.collectPage).not.toHaveBeenCalled();
    expect(test.preparation.prepare).not.toHaveBeenCalled();
  });

  it("should preserve the known durable continuation when a new page cannot start with current configuration", async () => {
    const test = fixture();
    const originalPage = await test.progress.collectPage.getMockImplementation()!({ tribeId: "first", operationId: "previous", expectedVersion: 0 });
    test.producer.selectNextTribe.mockResolvedValueOnce("first");
    test.progress.readProgress.mockResolvedValueOnce({ tribeId: "first", version: 1, hasContinuation: true, lastPage: { ...originalPage, sweepComplete: false }, lastSweepCompletedAtMicroseconds: null, lastCertifiedThroughMicroseconds: null });
    test.progress.collectPage.mockRejectedValueOnce(new AdmissionOperationError(ADMISSION_ERROR_CODE.connectionIncomplete));
    const result = await test.useCase.execute(test.deadline);
    expect(result.tribes[0]).toMatchObject({ operationId: "page-0", hasContinuation: true, collection: { status: "failed", code: "connection_incomplete" } });
    expect(test.progress.collectPage).toHaveBeenCalledExactlyOnceWith({ tribeId: "first", operationId: "page-0", expectedVersion: 1, softDeadlineAtMilliseconds: test.deadline });
  });

  it("should mark continuation unknown after an uncertain page commit instead of asserting the previous cursor is current", async () => {
    const test = fixture();
    const originalPage = await test.progress.collectPage.getMockImplementation()!({ tribeId: "first", operationId: "previous", expectedVersion: 0 });
    test.producer.selectNextTribe.mockResolvedValueOnce("first");
    test.progress.readProgress.mockResolvedValueOnce({ tribeId: "first", version: 1, hasContinuation: true, lastPage: { ...originalPage, sweepComplete: false }, lastSweepCompletedAtMicroseconds: null, lastCertifiedThroughMicroseconds: null });
    test.progress.collectPage.mockRejectedValueOnce(new AdmissionOperationError(ADMISSION_ERROR_CODE.operationUnresolved));
    const result = await test.useCase.execute(test.deadline);
    expect(result.tribes[0]).toMatchObject({ operationId: "page-0", hasContinuation: null, collection: { status: "unresolved", code: "operation_unresolved" } });
    expect(test.progress.collectPage).toHaveBeenCalledTimes(1);
  });

  it.each([
    { code: ADMISSION_ERROR_CODE.permissionDenied, status: "failed" },
    { code: ADMISSION_ERROR_CODE.operationUnresolved, status: "unresolved" },
  ])("should preserve prior confirmed selection turns when a later selection returns $code", async ({ code, status }) => {
    const test = fixture();
    test.producer.selectNextTribe.mockResolvedValueOnce("first").mockRejectedValueOnce(new AdmissionOperationError(code));
    const result = await test.useCase.execute(test.deadline);
    expect(result.selection).toEqual({ status, count: 1, code });
    expect(result.tribes).toHaveLength(1);
    expect(result.tribes[0]).toMatchObject({ tribeId: "first", collection: { status: "completed", count: 1 } });
    expect(test.producer.selectNextTribe).toHaveBeenCalledTimes(2);
    expect(test.progress.collectPage).toHaveBeenCalledTimes(1);
  });

  it("should prepare groups without repeating the independently composed logical reminder phase", async () => {
    const test = fixture();
    test.producer.selectNextTribe.mockResolvedValueOnce("first");
    const result = await test.useCase.prepareGroups(test.deadline);
    expect(result.reminders).toEqual({ status: "not_run", count: 0, code: null });
    expect(result.tribes[0]).toMatchObject({ tribeId: "first", collection: { status: "completed", count: 1 } });
    expect(test.producer.materializeReminders).not.toHaveBeenCalled();
  });

  it("should reproduce the pilot delay when every sweep re-examines more than 50 sources of 24 hours", async () => {
    const simulation = certificationSimulation(PILOT_SOURCE_COUNT, false);
    const frozenAt = await simulation.runUntilFrozen();
    // Three pages per sweep: the window waits for a whole sweep that started after its close, beyond the two-tick bound.
    expect(frozenAt! - simulation.closesAt).toBeGreaterThan(MAXIMUM_FREEZE_TICKS * DRIVER_TICK_MS);
  });

  it("should freeze a window within two ticks of its close when each sweep reads only the sources after its frontier", async () => {
    for (const sourceCount of [PILOT_SOURCE_COUNT, 10 * PILOT_SOURCE_COUNT]) {
      const simulation = certificationSimulation(sourceCount, true);
      const frozenAt = await simulation.runUntilFrozen();
      expect(frozenAt).not.toBeNull();
      expect(frozenAt!).toBeGreaterThanOrEqual(simulation.closesAt);
      expect(frozenAt! - simulation.closesAt).toBeLessThanOrEqual(MAXIMUM_FREEZE_TICKS * DRIVER_TICK_MS);
    }
  });
});
