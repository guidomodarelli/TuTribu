/** @vitest-environment node */
/** Exercises original phase/observation lifetimes with real deadlines and only own port fakes. @module admission-messaging-maintenance-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { RunAdmissionMessagingMaintenanceUseCase } from "@/src/modules/messaging/application/use-cases/run-admission-messaging-maintenance-use-case";
import { createUnstartedAdmissionMaintenancePhases, admissionMaintenanceMadeProgress  } from "@/src/modules/messaging/application/use-cases/admission-messaging-maintenance-state";
import type { AdmissionMessagingMaintenanceHealth, AdmissionMessagingMaintenancePhaseOutput, AdmissionMessagingMaintenanceProgress, AdmissionMessagingMaintenanceRun, AdmissionMessagingMaintenanceWork } from "@/src/modules/messaging/domain/repositories/admission-messaging-maintenance";
import { ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS, ADMISSION_MESSAGING_MAINTENANCE_PHASES, ADMISSION_MESSAGING_MAINTENANCE_PHASE } from "@/src/modules/messaging/constants/admission-messaging-maintenance";
import { ADMISSION_MESSAGING_MAINTENANCE_TEST_BUDGET_MS, ADMISSION_MESSAGING_MAINTENANCE_TEST_METRIC_BY_PHASE } from "@/tests/support/constants/admission-messaging-maintenance";
import { AdmissionMessagingMaintenanceError } from "@/src/modules/messaging/domain/errors/admission-messaging-maintenance-error";

/** @returns Own in-memory effect/observation ports; no framework, SDK, database library or timer is mocked. */
function fixture() {
  const runId = randomUUID(), now = Date.now();
  const health: AdmissionMessagingMaintenanceHealth = { available: true, observedAtMilliseconds: now, lastSuccessfulRunAtMilliseconds: null, oldestQueuedAtMilliseconds: null, queueAgeMilliseconds: null };
  const run: AdmissionMessagingMaintenanceRun = { runId, startedAtMilliseconds: now, firstPhaseIndex: 0, externalScope: { environment: "synthetic-maintenance", securityEpoch: randomUUID() }, health };
  const work = { runPhase: vi.fn<AdmissionMessagingMaintenanceWork["runPhase"]>().mockImplementation(async ({ phase }) => ({ status: "completed", reason: null, metrics: [{ key: ADMISSION_MESSAGING_MAINTENANCE_TEST_METRIC_BY_PHASE[phase], value: 1 }], hasRemainingWork: false })) };
  const progress = {
    begin: vi.fn<AdmissionMessagingMaintenanceProgress["begin"]>().mockImplementation(async () => ({ acquired: true, run })),
    recordPhase: vi.fn<AdmissionMessagingMaintenanceProgress["recordPhase"]>().mockResolvedValue(undefined),
    finish: vi.fn<AdmissionMessagingMaintenanceProgress["finish"]>().mockResolvedValue({ health, completed: true, deadlineReached: false }),
  };
  const deferred: Promise<void>[] = [], runtime = { now: Date.now, createId: () => runId, defer: (promise: Promise<void>) => { deferred.push(promise); }, report: vi.fn() };
  return { runId, run, health, work, progress, runtime, deferred, useCase: new RunAdmissionMessagingMaintenanceUseCase(work, progress, runtime) };
}

describe("fixed bounded admission messaging maintenance", () => {
  it("should compose and record every fixed independent phase without erasing its distinct confirmed metrics", async () => {
    const test = fixture(), result = await test.useCase.execute();
    expect(result).toMatchObject({ runId: test.runId, newRunStarted: true, status: "completed", observation: "recorded", deadlineReached: false });
    expect(test.work.runPhase.mock.calls.map(([{ phase }]) => phase)).toEqual(ADMISSION_MESSAGING_MAINTENANCE_PHASES);
    expect(result.phases.map((phase) => phase.metrics)).toEqual(ADMISSION_MESSAGING_MAINTENANCE_PHASES.map((phase) => [{ key: ADMISSION_MESSAGING_MAINTENANCE_TEST_METRIC_BY_PHASE[phase], value: 1 }]));
    // One start, then each settled phase shares its commit with the next start, then the last settlement alone.
    expect(test.progress.recordPhase).toHaveBeenCalledTimes(ADMISSION_MESSAGING_MAINTENANCE_PHASES.length + 1);
    expect(test.progress.recordPhase.mock.calls.slice(1, -1).every(([, settled, started]) => settled.status === "completed" && started?.status === "running")).toBe(true);
    expect(test.progress.finish).toHaveBeenCalledExactlyOnceWith(test.run, result.phases, false, expect.any(Number));
    expect(test.deferred).toEqual([]);
  });

  it("should give each phase a fair soft deadline that lets time unused by quick phases flow to later ones", async () => {
    const test = fixture(), result = await test.useCase.execute();
    expect(result.status).toBe("completed");
    const calls = test.work.runPhase.mock.calls.map(([request]) => request);
    for (const [index, call] of calls.entries()) {
      expect(call.phaseDeadlineAtMilliseconds).toBeLessThan(call.deadlineAtMilliseconds);
      if (index > 0) expect(call.phaseDeadlineAtMilliseconds!).toBeGreaterThanOrEqual(calls[index - 1].phaseDeadlineAtMilliseconds!);
    }
    // With quick phases, the last one may use almost all the time left before the finish reserve.
    expect(calls.at(-1)!.deadlineAtMilliseconds - calls.at(-1)!.phaseDeadlineAtMilliseconds!).toBeLessThanOrEqual(5_000);
  });

  it("should stop a slow phase at its soft deadline so later phases still run in the same invocation", async () => {
    const test = fixture(), original = test.work.runPhase.getMockImplementation()!;
    test.work.runPhase.mockImplementation(async (request) => {
      if (request.phase !== ADMISSION_MESSAGING_MAINTENANCE_PHASE.notifications) return original(request);
      // A cooperative owner that always has more work stops at its own soft deadline.
      while (Date.now() < request.phaseDeadlineAtMilliseconds!) await new Promise((resolve) => setTimeout(resolve, 1));
      return { status: "deferred", reason: "deadline_reached", metrics: [{ key: "collected_notification_sources", value: 3 }], hasRemainingWork: true };
    });
    const result = await new RunAdmissionMessagingMaintenanceUseCase(test.work, test.progress, test.runtime, ADMISSION_MESSAGING_MAINTENANCE_TEST_BUDGET_MS * 3).execute();
    expect(result.status).toBe("incomplete");
    expect(test.work.runPhase).toHaveBeenCalledTimes(ADMISSION_MESSAGING_MAINTENANCE_PHASES.length);
    expect(result.phases.filter((phase) => phase.status === "completed")).toHaveLength(ADMISSION_MESSAGING_MAINTENANCE_PHASES.length - 1);
    expect(admissionMaintenanceMadeProgress(result)).toBe(true);
  });

  it("should record the previous settled phase alone when the native lease no longer authorizes the next start", async () => {
    const test = fixture();
    test.progress.recordPhase.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new AdmissionMessagingMaintenanceError("deadline_reached"));
    const result = await test.useCase.execute();
    expect(result).toMatchObject({ status: "incomplete", deadlineReached: true, observation: "recorded" });
    expect(result.phases[0]).toMatchObject({ status: "completed", observation: "recorded" });
    expect(result.phases[1]).toMatchObject({ status: "not_run", reason: "deadline_reached" });
    expect(test.work.runPhase).toHaveBeenCalledTimes(1);
    expect(test.progress.recordPhase.mock.calls.at(-1)).toHaveLength(2);
    expect(test.progress.recordPhase.mock.calls.at(-1)![1]).toMatchObject({ phase: "expire_requests", status: "completed" });
    expect(admissionMaintenanceMadeProgress(result)).toBe(true);
  });

  it("should not treat missing configuration or uncertainty as budget-only progress", async () => {
    const test = fixture(), original = test.work.runPhase.getMockImplementation()!;
    test.work.runPhase.mockImplementation(async (request) => request.phase === ADMISSION_MESSAGING_MAINTENANCE_PHASE.dispatch ? { status: "not_configured", reason: "configuration_unavailable", metrics: [], hasRemainingWork: true } : original(request));
    expect(admissionMaintenanceMadeProgress(await test.useCase.execute())).toBe(false);
    test.work.runPhase.mockImplementation(async (request) => request.phase === ADMISSION_MESSAGING_MAINTENANCE_PHASE.dispatch ? { status: "unresolved", reason: "operation_unresolved", metrics: [], hasRemainingWork: true } : original(request));
    expect(admissionMaintenanceMadeProgress(await test.useCase.execute())).toBe(false);
  });

  it("should rotate the first phase using the original persisted turn instead of always spending the deadline on expiration", async () => {
    const test = fixture(), position = ADMISSION_MESSAGING_MAINTENANCE_PHASES.length - 1;
    test.progress.begin.mockResolvedValue({ acquired: true, run: { ...test.run, firstPhaseIndex: position } });
    expect((await test.useCase.execute()).status).toBe("completed");
    expect(test.work.runPhase.mock.calls.map(([{ phase }]) => phase)).toEqual([...ADMISSION_MESSAGING_MAINTENANCE_PHASES.slice(position), ...ADMISSION_MESSAGING_MAINTENANCE_PHASES.slice(0, position)]);
  });

  it("should preserve earlier confirmed work and continue independent owners after one phase becomes unresolved", async () => {
    const test = fixture();
    test.work.runPhase.mockImplementationOnce(test.work.runPhase.getMockImplementation()!).mockRejectedValueOnce(new Error("Synthetic original retention commit cannot be confirmed"));
    const result = await test.useCase.execute();
    expect(result.status).toBe("incomplete");
    expect(result.phases[0]).toMatchObject({ status: "completed", metrics: [{ key: "expired_requests", value: 1 }] });
    expect(result.phases[1]).toMatchObject({ status: "unresolved", reason: "operation_unresolved", observation: "recorded", metrics: [] });
    expect(result.phases.slice(2).every((phase) => phase.status === "completed" && phase.metrics[0].value === 1)).toBe(true);
    expect(test.work.runPhase).toHaveBeenCalledTimes(ADMISSION_MESSAGING_MAINTENANCE_PHASES.length);
    expect(test.runtime.report).toHaveBeenCalledTimes(1);
  });

  it("should expose missing external configuration while preserving the completed internal phases", async () => {
    const test = fixture(), original = test.work.runPhase.getMockImplementation()!;
    test.work.runPhase.mockImplementation(async (request) => request.phase === ADMISSION_MESSAGING_MAINTENANCE_PHASE.dispatch ? { status: "not_configured", reason: "configuration_unavailable", metrics: [], hasRemainingWork: true } : original(request));
    const result = await test.useCase.execute();
    expect(result.status).toBe("incomplete");
    expect(result.phases.find((phase) => phase.phase === ADMISSION_MESSAGING_MAINTENANCE_PHASE.dispatch)).toMatchObject({ status: "not_configured", metrics: [], hasRemainingWork: true });
    expect(result.phases.find((phase) => phase.phase === ADMISSION_MESSAGING_MAINTENANCE_PHASE.reminders)?.metrics[0].value).toBe(1);
    expect(test.work.runPhase).toHaveBeenCalledTimes(ADMISSION_MESSAGING_MAINTENANCE_PHASES.length);
  });

  it("should keep a confirmed work count when observation fails and avoid starting further unobserved business phases", async () => {
    const test = fixture();
    test.progress.recordPhase.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Synthetic observation storage unavailable"));
    const result = await test.useCase.execute();
    expect(result).toMatchObject({ status: "incomplete", observation: "unavailable" });
    expect(result.phases[0]).toMatchObject({ status: "completed", observation: "unavailable", metrics: [{ key: "expired_requests", value: 1 }] });
    expect(result.phases.slice(1).every((phase) => phase.status === "not_run")).toBe(true);
    expect(test.work.runPhase).toHaveBeenCalledTimes(1);
  });

  it("should retain a late original effect and its observation without starting another phase or repeating work", async () => {
    const test = fixture();
    let settle!: (value: AdmissionMessagingMaintenancePhaseOutput) => void;
    test.work.runPhase.mockImplementationOnce(async () => new Promise((resolve) => { settle = resolve; }));
    const useCase = new RunAdmissionMessagingMaintenanceUseCase(test.work, test.progress, test.runtime, ADMISSION_MESSAGING_MAINTENANCE_TEST_BUDGET_MS);
    const result = await useCase.execute();
    expect(result).toMatchObject({ status: "incomplete", deadlineReached: true, observation: "pending" });
    expect(result.phases[0]).toMatchObject({ status: "unresolved", reason: "deadline_reached" });
    expect(test.work.runPhase).toHaveBeenCalledTimes(1);
    expect(test.work.runPhase.mock.calls[0][0].signal.aborted).toBe(true);
    settle({ status: "completed", reason: null, metrics: [{ key: "expired_requests", value: 1 }], hasRemainingWork: false });
    await Promise.all(test.deferred);
    expect(test.work.runPhase).toHaveBeenCalledTimes(1);
    expect(test.progress.recordPhase.mock.calls[0][1]).toMatchObject({ status: "running", observation: "pending" });
    expect(test.progress.recordPhase.mock.calls.at(-1)![1]).toMatchObject({ status: "completed", late: true, metrics: [{ key: "expired_requests", value: 1 }] });
    expect(test.progress.finish).toHaveBeenCalledTimes(1);
    expect(test.progress.finish.mock.calls[0][2]).toBe(true);
  });

  it.each([0, 1])("should not start business work or claim a registered new run when its original begin is observed %i ms after the deadline", async (lateMilliseconds) => {
    const test = fixture();
    let observedAtMilliseconds = test.run.startedAtMilliseconds;
    test.runtime.now = () => observedAtMilliseconds;
    let settle!: (value: Awaited<ReturnType<AdmissionMessagingMaintenanceProgress["begin"]>>) => void;
    test.progress.begin.mockImplementationOnce(async () => new Promise((resolve) => { settle = resolve; }));
    const result = await new RunAdmissionMessagingMaintenanceUseCase(test.work, test.progress, test.runtime, ADMISSION_MESSAGING_MAINTENANCE_TEST_BUDGET_MS).execute();
    expect(result).toMatchObject({ runId: null, status: "unresolved", newRunStarted: false, observation: "pending" });
    // Advance the owned clock explicitly; native timer rounding must not decide deadline expiry.
    observedAtMilliseconds += ADMISSION_MESSAGING_MAINTENANCE_TEST_BUDGET_MS + lateMilliseconds;
    settle({ acquired: true, run: test.run });
    await Promise.all(test.deferred);
    expect(test.work.runPhase).not.toHaveBeenCalled();
    expect(test.progress.finish).toHaveBeenCalledExactlyOnceWith(test.run, createUnstartedAdmissionMaintenancePhases(), true, 0);
  });

  it("should retain confirmed late counters in final evidence when their independent phase observation fails", async () => {
    const test = fixture();
    let settle!: (value: AdmissionMessagingMaintenancePhaseOutput) => void;
    test.work.runPhase.mockImplementationOnce(async () => new Promise((resolve) => { settle = resolve; }));
    test.progress.recordPhase.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Synthetic late observation unavailable"));
    const result = await new RunAdmissionMessagingMaintenanceUseCase(test.work, test.progress, test.runtime, ADMISSION_MESSAGING_MAINTENANCE_TEST_BUDGET_MS).execute();
    expect(result).toMatchObject({ status: "incomplete", observation: "pending", deadlineReached: true });
    settle({ status: "completed", reason: null, metrics: [{ key: "expired_requests", value: 1 }], hasRemainingWork: false });
    await Promise.all(test.deferred);
    expect(test.progress.finish.mock.calls[0][1][0]).toMatchObject({ status: "completed", late: true, observation: "unavailable", metrics: [{ key: "expired_requests", value: 1 }] });
    expect(test.work.runPhase).toHaveBeenCalledTimes(1);
    expect(test.progress.finish).toHaveBeenCalledTimes(1);
    expect(test.progress.finish.mock.calls[0][2]).toBe(true);
  });

  it("should report the actual busy original without initializing another workflow or calling business owners", async () => {
    const test = fixture();
    test.progress.begin.mockResolvedValueOnce({ acquired: false, existingRunId: test.runId, phases: createUnstartedAdmissionMaintenancePhases(), health: test.health });
    expect(await test.useCase.execute()).toMatchObject({ runId: test.runId, status: "busy", newRunStarted: false, observation: "recorded" });
    expect(test.work.runPhase).not.toHaveBeenCalled();
    expect(test.progress.finish).not.toHaveBeenCalled();
  });

  it("should reject a backend budget above the original production limit before the first owner operation", async () => {
    const test = fixture();
    await expect(new RunAdmissionMessagingMaintenanceUseCase(test.work, test.progress, test.runtime, ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS + 1).execute()).rejects.toMatchObject({ reason: "configuration_unavailable" });
    expect(test.progress.begin).not.toHaveBeenCalled();
    expect(test.work.runPhase).not.toHaveBeenCalled();
  });

  it("should preserve the native finish deadline even when the host observed all work and records before its own timer", async () => {
    const test = fixture();
    test.progress.finish.mockResolvedValueOnce({ health: test.health, completed: false, deadlineReached: true });
    const result = await test.useCase.execute();
    expect(result).toMatchObject({ status: "incomplete", deadlineReached: true, observation: "recorded" });
    expect(result.phases.every((phase) => phase.status === "completed" && phase.metrics[0].value === 1)).toBe(true);
  });

  it("should never start a business effect whose original start observation did not settle inside the deadline", async () => {
    const test = fixture();
    let settle!: () => void;
    test.progress.recordPhase.mockImplementationOnce(async () => new Promise<void>((resolve) => { settle = resolve; }));
    const result = await new RunAdmissionMessagingMaintenanceUseCase(test.work, test.progress, test.runtime, ADMISSION_MESSAGING_MAINTENANCE_TEST_BUDGET_MS).execute();
    expect(result).toMatchObject({ status: "incomplete", deadlineReached: true, observation: "pending" });
    expect(result.phases[0]).toMatchObject({ status: "not_run", reason: "deadline_reached" });
    expect(test.work.runPhase).not.toHaveBeenCalled();
    settle();
    await Promise.all(test.deferred);
    expect(test.work.runPhase).not.toHaveBeenCalled();
    expect(test.progress.finish.mock.calls[0][1][0]).toMatchObject({ status: "not_run", observation: "recorded" });
  });
});
