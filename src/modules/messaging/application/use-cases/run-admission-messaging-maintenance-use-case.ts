/** Coordinates the fixed admission owners under one deadline without retrying uncertain effects. @module run-admission-messaging-maintenance-use-case */
import type { AdmissionMessagingMaintenancePhase, AdmissionMessagingMaintenancePhaseOutput, AdmissionMessagingMaintenancePhaseSnapshot, AdmissionMessagingMaintenanceProgress, AdmissionMessagingMaintenanceResult, AdmissionMessagingMaintenanceRuntime, AdmissionMessagingMaintenanceWork } from "../../domain/repositories/admission-messaging-maintenance";
import { AdmissionMessagingMaintenanceError } from "../../domain/errors/admission-messaging-maintenance-error";
import { ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS, ADMISSION_MESSAGING_MAINTENANCE_FINISH_RESERVE_MS, ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION, ADMISSION_MESSAGING_MAINTENANCE_OPERATION, ADMISSION_MESSAGING_MAINTENANCE_PHASES, ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS, ADMISSION_MESSAGING_MAINTENANCE_REASON, ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS, ADMISSION_MESSAGING_MAINTENANCE_RUNNING_PHASE } from "../../constants/admission-messaging-maintenance";
import { observeWithin } from "./observe-dispatch-deadline";
import { admissionMaintenanceCompleted, admissionMaintenancePhaseDeadline, createUnavailableAdmissionMaintenanceHealth, createUnstartedAdmissionMaintenancePhase, createUnstartedAdmissionMaintenancePhases, projectAdmissionMaintenancePhase } from "./admission-messaging-maintenance-state";

/** Keeps all mutable run observations local, including retained original late work. */
export class RunAdmissionMessagingMaintenanceUseCase {
  /** @param work - Fixed phase composition of real existing owners. @param progress - Current private lease and native observations. @param runtime - Original host clock, lifetime and diagnostics. @param budgetMilliseconds - Explicit backend limit, never above the existing worker maximum. */
  constructor(private readonly work: AdmissionMessagingMaintenanceWork, private readonly progress: AdmissionMessagingMaintenanceProgress, private readonly runtime: AdmissionMessagingMaintenanceRuntime, private readonly budgetMilliseconds: number = ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS) {}

  /** @param error - Original private failure. @param runId - Actual correlation, never a promise of registration. @param phase - Actual fixed owner, if started. @returns A closed unresolved/known-denial output without inferring rollback. */
  private failure(error: unknown, runId: string, phase?: AdmissionMessagingMaintenancePhase): AdmissionMessagingMaintenancePhaseOutput {
    this.runtime.report(error, { operation: ADMISSION_MESSAGING_MAINTENANCE_OPERATION.phase, runId, ...(phase ? { phase } : {}) });
    const reason = error instanceof AdmissionMessagingMaintenanceError ? error.reason : ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved;
    const status = reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.configurationUnavailable ? ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.notConfigured : reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.authorityUnavailable || reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.recoveryLocked ? ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.failed : ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.unresolved;
    return { status, reason, metrics: [], hasRemainingWork: true };
  }

  /**
   * Each phase gets a soft deadline (a fair share of the time left before the finish reserve) that owners use to stop starting new work,
   * while the shared hard deadline still bounds observation and commits. Settling one phase and starting the next share one observation commit.
   * @returns Original confirmed phase evidence and native health; deadline expiry retains the original late observation without starting another phase.
   */
  async execute(): Promise<AdmissionMessagingMaintenanceResult> {
    if (!Number.isInteger(this.budgetMilliseconds) || this.budgetMilliseconds < 1 || this.budgetMilliseconds > ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.configurationUnavailable);
    const startedAtMilliseconds = this.runtime.now(), deadlineAtMilliseconds = startedAtMilliseconds + this.budgetMilliseconds, runId = this.runtime.createId();
    // Proportional for small (test) budgets, fixed for the production budget.
    const finishReserveMilliseconds = Math.min(ADMISSION_MESSAGING_MAINTENANCE_FINISH_RESERVE_MS, Math.floor(this.budgetMilliseconds / (ADMISSION_MESSAGING_MAINTENANCE_PHASES.length + 1)));
    const workDeadlineAtMilliseconds = deadlineAtMilliseconds - finishReserveMilliseconds;
    let phases = createUnstartedAdmissionMaintenancePhases();
    const unknownHealth = createUnavailableAdmissionMaintenanceHealth();
    const remaining = () => Math.max(0, deadlineAtMilliseconds - this.runtime.now());
    const report = (error: unknown, operation: string, phase?: AdmissionMessagingMaintenancePhase) => this.runtime.report(error, { operation, runId, ...(phase ? { phase } : {}) });
    let beginning;
    try {
      const original = this.progress.begin(runId);
      const observed = await observeWithin(original, remaining());
      if (!observed.settled) {
        this.runtime.defer(original.then(async (late) => { if (late.acquired) await this.progress.finish(late.run, phases, true, Math.max(0, deadlineAtMilliseconds - (late.run.clockObservedAtMilliseconds ?? this.runtime.now()))); }).catch((error) => report(error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.late)));
        return { runId: null, status: ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.unresolved, newRunStarted: false, deadlineReached: true, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.pending, phases, health: unknownHealth };
      }
      beginning = observed.value;
    } catch (error) {
      report(error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.begin);
      return { runId: null, status: ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.unresolved, newRunStarted: false, deadlineReached: remaining() <= 0, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable, phases, health: unknownHealth };
    }
    if (!beginning.acquired) return { runId: beginning.existingRunId, status: beginning.existingStatus ?? ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.busy, newRunStarted: false, deadlineReached: beginning.deadlineReached ?? false, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded, phases: beginning.phases, health: beginning.health };
    const run = beginning.run;
    const observationBudgetMilliseconds = Math.max(0, deadlineAtMilliseconds - (run.clockObservedAtMilliseconds ?? this.runtime.now()));
    let deadlineReached = false, observationUnavailable = false;
    const lateWrites: Promise<void>[] = [];
    const update = (snapshot: AdmissionMessagingMaintenancePhaseSnapshot) => { phases = phases.map((phase) => phase.phase === snapshot.phase ? snapshot : phase); };
    /** Settled evidence of the previous phase, committed together with the next phase's start (or alone after the loop). */
    let pendingSettled: AdmissionMessagingMaintenancePhaseSnapshot | null = null;
    /** @param snapshot - Settled phase evidence. @returns After recording it alone, or retaining its late observation. */
    const recordSettled = async (snapshot: AdmissionMessagingMaintenancePhaseSnapshot) => {
      try {
        const original = this.progress.recordPhase(run, snapshot), observed = await observeWithin(original, remaining());
        if (!observed.settled) {
          deadlineReached = true;
          lateWrites.push(original.then(() => update({ ...snapshot, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded, late: true })).catch((error) => { observationUnavailable = true; report(error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.late, snapshot.phase); }));
          return;
        }
        update({ ...snapshot, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded });
      } catch (error) {
        observationUnavailable = true;
        update({ ...snapshot, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable });
        report(error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.record, snapshot.phase);
      }
    };
    const order = [...ADMISSION_MESSAGING_MAINTENANCE_PHASES.slice(run.firstPhaseIndex), ...ADMISSION_MESSAGING_MAINTENANCE_PHASES.slice(0, run.firstPhaseIndex)];
    for (const [index, phase] of order.entries()) {
      if (this.runtime.now() >= workDeadlineAtMilliseconds) { deadlineReached = true; break; }
      const phaseStarted = this.runtime.now(), controller = new AbortController();
      const phaseDeadlineAtMilliseconds = admissionMaintenancePhaseDeadline(phaseStarted, workDeadlineAtMilliseconds, order.length - index);
      const starting: AdmissionMessagingMaintenancePhaseSnapshot = { ...createUnstartedAdmissionMaintenancePhase(phase), status: ADMISSION_MESSAGING_MAINTENANCE_RUNNING_PHASE, startedAtMilliseconds: phaseStarted, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.pending };
      const settled: AdmissionMessagingMaintenancePhaseSnapshot | null = pendingSettled;
      pendingSettled = null;
      update(starting);
      try {
        const original = settled ? this.progress.recordPhase(run, settled, starting) : this.progress.recordPhase(run, starting), observed = await observeWithin(original, remaining());
        if (!observed.settled) {
          deadlineReached = true;
          const notStarted = { ...createUnstartedAdmissionMaintenancePhase(phase), reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.pending };
          update(notStarted);
          lateWrites.push(original.then(() => { update({ ...notStarted, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded, late: true }); if (settled) update({ ...settled, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded, late: true }); }).catch((error) => {
            observationUnavailable = true;
            if (settled) update({ ...settled, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable });
            report(error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.late, phase);
          }));
          break;
        }
        update({ ...starting, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded });
        if (settled) update({ ...settled, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded });
      } catch (error) {
        if (error instanceof AdmissionMessagingMaintenanceError && error.reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached) {
          // The native lease or deadline no longer authorizes this start; the previous settled evidence is still recorded alone below.
          deadlineReached = true;
          update({ ...createUnstartedAdmissionMaintenancePhase(phase), reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached });
          pendingSettled = settled;
          break;
        }
        observationUnavailable = true;
        update({ ...createUnstartedAdmissionMaintenancePhase(phase), reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.observationUnavailable, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable });
        if (settled) update({ ...settled, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable });
        report(error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.record, phase);
        break;
      }
      if (remaining() <= 0) { deadlineReached = true; update({ ...createUnstartedAdmissionMaintenancePhase(phase), reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded }); break; }
      let snapshot: AdmissionMessagingMaintenancePhaseSnapshot;
      try {
        const original = this.work.runPhase(phase, deadlineAtMilliseconds, controller.signal, run, phaseDeadlineAtMilliseconds);
        const observed = await observeWithin(original, remaining(), () => controller.abort());
        if (!observed.settled) {
          deadlineReached = true;
          update(projectAdmissionMaintenancePhase(phase, { status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.unresolved, reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached, metrics: [], hasRemainingWork: true }, phaseStarted, this.runtime.now()));
          const late = original.catch((error) => this.failure(error, runId, phase)).then(async (output) => {
            const completed = projectAdmissionMaintenancePhase(phase, output, phaseStarted, this.runtime.now(), true);
            update(completed);
            try { await this.progress.recordPhase(run, completed); }
            catch (error) { update({ ...completed, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable }); throw error; }
            update({ ...completed, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded });
          }).catch((error) => { observationUnavailable = true; report(error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.late, phase); });
          lateWrites.push(late);
          break;
        }
        snapshot = projectAdmissionMaintenancePhase(phase, observed.value, phaseStarted, this.runtime.now());
      } catch (error) { snapshot = projectAdmissionMaintenancePhase(phase, this.failure(error, runId, phase), phaseStarted, this.runtime.now()); }
      update(snapshot);
      pendingSettled = snapshot;
      if (snapshot.reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.authorityUnavailable || snapshot.reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.recoveryLocked) break;
    }
    if (pendingSettled) await recordSettled(pendingSettled);
    deadlineReached ||= remaining() <= 0;
    if (lateWrites.length) {
      this.runtime.defer(Promise.all(lateWrites).then(async () => { await this.progress.finish(run, phases, true, observationBudgetMilliseconds); }).catch((error) => report(error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.finish)));
      return { runId, status: ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.incomplete, newRunStarted: true, deadlineReached: true, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.pending, phases, health: run.health };
    }
    try {
      const original = this.progress.finish(run, phases, deadlineReached, observationBudgetMilliseconds), observed = await observeWithin(original, remaining());
      if (!observed.settled) {
        this.runtime.defer(original.then(() => undefined).catch((error) => report(error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.finish)));
        return { runId, status: ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.incomplete, newRunStarted: true, deadlineReached: true, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.pending, phases, health: run.health };
      }
      deadlineReached ||= observed.value.deadlineReached;
      return { runId, status: !observationUnavailable && observed.value.completed && admissionMaintenanceCompleted(phases, deadlineReached) ? ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.completed : ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.incomplete, newRunStarted: true, deadlineReached, observation: observationUnavailable ? ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable : ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded, phases, health: observed.value.health };
    } catch (error) {
      report(error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.finish);
      return { runId, status: ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.incomplete, newRunStarted: true, deadlineReached: remaining() <= 0, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable, phases, health: run.health };
    }
  }
}
