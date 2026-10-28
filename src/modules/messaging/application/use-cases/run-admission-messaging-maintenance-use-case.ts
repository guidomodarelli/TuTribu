/** Coordinates the fixed admission owners under one deadline without retrying uncertain effects. @module run-admission-messaging-maintenance-use-case */
import type { AdmissionMessagingMaintenanceBeginning, AdmissionMessagingMaintenancePhase, AdmissionMessagingMaintenancePhaseOutput, AdmissionMessagingMaintenanceRun, AdmissionMessagingMaintenancePhaseSnapshot, AdmissionMessagingMaintenanceProgress, AdmissionMessagingMaintenanceResult, AdmissionMessagingMaintenanceRuntime, AdmissionMessagingMaintenanceWork } from "../../domain/repositories/admission-messaging-maintenance";
import { AdmissionMessagingMaintenanceError } from "../../domain/errors/admission-messaging-maintenance-error";
import { ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS, ADMISSION_MESSAGING_MAINTENANCE_FINISH_RESERVE_MS, ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION, ADMISSION_MESSAGING_MAINTENANCE_OPERATION, ADMISSION_MESSAGING_MAINTENANCE_PHASES, ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS, ADMISSION_MESSAGING_MAINTENANCE_REASON, ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS, ADMISSION_MESSAGING_MAINTENANCE_RUNNING_PHASE } from "../../constants/admission-messaging-maintenance";
import { observeWithin } from "./observe-dispatch-deadline";
import { admissionMaintenanceCompleted, admissionMaintenancePhaseDeadline, createUnavailableAdmissionMaintenanceHealth, createUnstartedAdmissionMaintenancePhase, createUnstartedAdmissionMaintenancePhases, projectAdmissionMaintenancePhase } from "./admission-messaging-maintenance-state";

/** @param reason - Classified phase failure. @returns Missing configuration, a known authority failure, or an unresolved effect. */
function maintenanceFailureStatus(reason: AdmissionMessagingMaintenancePhaseOutput["reason"]): AdmissionMessagingMaintenancePhaseOutput["status"] {
  if (reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.configurationUnavailable) return ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.notConfigured;
  if (reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.authorityUnavailable || reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.recoveryLocked) return ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.failed;
  return ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.unresolved;
}

/** Correlation and deadlines fixed before the native lease is requested. */
type MaintenanceDeadlines = { readonly runId: string; readonly deadlineAtMilliseconds: number; readonly workDeadlineAtMilliseconds: number };

/** Mutable observations of one acquired run; only its own execution reads or writes them. */
type MaintenanceRunState = MaintenanceDeadlines & {
  readonly run: AdmissionMessagingMaintenanceRun;
  readonly observationBudgetMilliseconds: number;
  phases: AdmissionMessagingMaintenancePhaseSnapshot[];
  deadlineReached: boolean;
  observationUnavailable: boolean;
  readonly lateWrites: Promise<void>[];
  /** Settled evidence of the previous phase, committed together with the next phase's start (or alone after the loop). */
  pendingSettled: AdmissionMessagingMaintenancePhaseSnapshot | null;
};

/** @param state - Current run. @param snapshot - Newest evidence of one phase. @returns Nothing after replacing that phase's evidence. */
function updatePhase(state: MaintenanceRunState, snapshot: AdmissionMessagingMaintenancePhaseSnapshot): void {
  state.phases = state.phases.map((phase) => phase.phase === snapshot.phase ? snapshot : phase);
}

/** Keeps all mutable run observations local, including retained original late work. */
export class RunAdmissionMessagingMaintenanceUseCase {
  /** @param work - Fixed phase composition of real existing owners. @param progress - Current private lease and native observations. @param runtime - Original host clock, lifetime and diagnostics. @param budgetMilliseconds - Explicit backend limit, never above the existing worker maximum. */
  constructor(private readonly work: AdmissionMessagingMaintenanceWork, private readonly progress: AdmissionMessagingMaintenanceProgress, private readonly runtime: AdmissionMessagingMaintenanceRuntime, private readonly budgetMilliseconds: number = ADMISSION_MESSAGING_MAINTENANCE_BUDGET_MS) {}

  /** @param error - Original private failure. @param runId - Actual correlation, never a promise of registration. @param phase - Actual fixed owner, if started. @returns A closed unresolved/known-denial output without inferring rollback. */
  private failure(error: unknown, runId: string, phase?: AdmissionMessagingMaintenancePhase): AdmissionMessagingMaintenancePhaseOutput {
    this.runtime.report(error, { operation: ADMISSION_MESSAGING_MAINTENANCE_OPERATION.phase, runId, ...(phase ? { phase } : {}) });
    const reason = error instanceof AdmissionMessagingMaintenanceError ? error.reason : ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved;
    const status = maintenanceFailureStatus(reason);
    return { status, reason, metrics: [], hasRemainingWork: true };
  }

  /** @param deadlineAtMilliseconds - Shared hard deadline. @returns Milliseconds left before it, never negative. */
  private remaining(deadlineAtMilliseconds: number): number { return Math.max(0, deadlineAtMilliseconds - this.runtime.now()); }

  /** @param runId - Actual correlation. @param error - Original private failure. @param operation - Fixed observation operation. @param phase - Actual fixed owner, if any. @returns Nothing after the safe diagnostic. */
  private report(runId: string, error: unknown, operation: string, phase?: AdmissionMessagingMaintenancePhase): void {
    this.runtime.report(error, { operation, runId, ...(phase ? { phase } : {}) });
  }

  /**
   * Acquires the native lease for a new run, retaining a late acquisition's own finish.
   * @param deadlines - Correlation and deadlines fixed before the request.
   * @param phases - Unstarted phase evidence reported when no new run starts.
   * @returns The acquired run, or the final result when no new run started.
   */
  private async begin(deadlines: MaintenanceDeadlines, phases: AdmissionMessagingMaintenancePhaseSnapshot[]): Promise<{ run: AdmissionMessagingMaintenanceRun } | { result: AdmissionMessagingMaintenanceResult }> {
    const { runId, deadlineAtMilliseconds } = deadlines;
    const unknownHealth = createUnavailableAdmissionMaintenanceHealth();
    let beginning: AdmissionMessagingMaintenanceBeginning;
    try {
      const original = this.progress.begin(runId);
      const observed = await observeWithin(original, this.remaining(deadlineAtMilliseconds));
      if (!observed.settled) {
        this.runtime.defer(original.then(async (late) => { if (late.acquired) await this.progress.finish(late.run, phases, true, Math.max(0, deadlineAtMilliseconds - (late.run.clockObservedAtMilliseconds ?? this.runtime.now()))); }).catch((error: unknown) => this.report(runId, error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.late)));
        return { result: { runId: null, status: ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.unresolved, newRunStarted: false, deadlineReached: true, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.pending, phases, health: unknownHealth } };
      }
      beginning = observed.value;
    } catch (error) {
      this.report(runId, error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.begin);
      return { result: { runId: null, status: ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.unresolved, newRunStarted: false, deadlineReached: this.remaining(deadlineAtMilliseconds) <= 0, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable, phases, health: unknownHealth } };
    }
    if (!beginning.acquired) return { result: { runId: beginning.existingRunId, status: beginning.existingStatus ?? ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.busy, newRunStarted: false, deadlineReached: beginning.deadlineReached ?? false, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded, phases: beginning.phases, health: beginning.health } };
    return { run: beginning.run };
  }

  /** @param state - Current run. @param snapshot - Settled phase evidence. @returns After recording it alone, or retaining its late observation. */
  private async recordSettled(state: MaintenanceRunState, snapshot: AdmissionMessagingMaintenancePhaseSnapshot): Promise<void> {
    try {
      const original = this.progress.recordPhase(state.run, snapshot), observed = await observeWithin(original, this.remaining(state.deadlineAtMilliseconds));
      if (!observed.settled) {
        state.deadlineReached = true;
        state.lateWrites.push(original.then(() => updatePhase(state, { ...snapshot, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded, late: true })).catch((error: unknown) => { state.observationUnavailable = true; this.report(state.runId, error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.late, snapshot.phase); }));
        return;
      }
      updatePhase(state, { ...snapshot, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded });
    } catch (error) {
      state.observationUnavailable = true;
      updatePhase(state, { ...snapshot, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable });
      this.report(state.runId, error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.record, snapshot.phase);
    }
  }

  /**
   * Records a phase start together with the previous settled phase, in one observation commit.
   * @param state - Current run.
   * @param phase - Fixed owner about to start.
   * @param phaseStarted - Start of the phase on the runtime clock.
   * @returns Whether the start was recorded and the phase may run.
   */
  private async startPhase(state: MaintenanceRunState, phase: AdmissionMessagingMaintenancePhase, phaseStarted: number): Promise<boolean> {
    const starting: AdmissionMessagingMaintenancePhaseSnapshot = { ...createUnstartedAdmissionMaintenancePhase(phase), status: ADMISSION_MESSAGING_MAINTENANCE_RUNNING_PHASE, startedAtMilliseconds: phaseStarted, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.pending };
    const settled: AdmissionMessagingMaintenancePhaseSnapshot | null = state.pendingSettled;
    state.pendingSettled = null;
    updatePhase(state, starting);
    try {
      const original = settled ? this.progress.recordPhase(state.run, settled, starting) : this.progress.recordPhase(state.run, starting), observed = await observeWithin(original, this.remaining(state.deadlineAtMilliseconds));
      if (!observed.settled) {
        state.deadlineReached = true;
        const notStarted = { ...createUnstartedAdmissionMaintenancePhase(phase), reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.pending };
        updatePhase(state, notStarted);
        state.lateWrites.push(original.then(() => { updatePhase(state, { ...notStarted, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded, late: true }); if (settled) updatePhase(state, { ...settled, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded, late: true }); }).catch((error: unknown) => {
          state.observationUnavailable = true;
          if (settled) updatePhase(state, { ...settled, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable });
          this.report(state.runId, error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.late, phase);
        }));
        return false;
      }
      updatePhase(state, { ...starting, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded });
      if (settled) updatePhase(state, { ...settled, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded });
      return true;
    } catch (error) {
      if (error instanceof AdmissionMessagingMaintenanceError && error.reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached) {
        // The native lease or deadline no longer authorizes this start; the previous settled evidence is still recorded alone below.
        state.deadlineReached = true;
        updatePhase(state, { ...createUnstartedAdmissionMaintenancePhase(phase), reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached });
        state.pendingSettled = settled;
        return false;
      }
      state.observationUnavailable = true;
      updatePhase(state, { ...createUnstartedAdmissionMaintenancePhase(phase), reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.observationUnavailable, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable });
      if (settled) updatePhase(state, { ...settled, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable });
      this.report(state.runId, error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.record, phase);
      return false;
    }
  }

  /**
   * Keeps observing a phase that outlived the run deadline, recording its original late outcome once.
   * @param state - Current run.
   * @param phase - Fixed owner still running.
   * @param original - The phase's original work, never restarted.
   * @param phaseStarted - Start of the phase on the runtime clock.
   * @returns The retained late observation; it never rejects.
   */
  private observeLatePhase(state: MaintenanceRunState, phase: AdmissionMessagingMaintenancePhase, original: Promise<AdmissionMessagingMaintenancePhaseOutput>, phaseStarted: number): Promise<void> {
    return original.catch((error: unknown) => this.failure(error, state.runId, phase)).then(async (output) => {
      const completed = projectAdmissionMaintenancePhase(phase, output, { startedAtMilliseconds: phaseStarted, finishedAtMilliseconds: this.runtime.now(), late: true });
      updatePhase(state, completed);
      try { await this.progress.recordPhase(state.run, completed); }
      catch (error) { updatePhase(state, { ...completed, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable }); throw error; }
      updatePhase(state, { ...completed, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded });
    }).catch((error: unknown) => { state.observationUnavailable = true; this.report(state.runId, error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.late, phase); });
  }

  /**
   * Runs one started phase within the hard deadline.
   * @param state - Current run.
   * @param phase - Fixed owner whose start was recorded.
   * @param timing - Phase start and its soft deadline for starting new work.
   * @returns The settled phase evidence, or null when the phase outlived the deadline and is observed late.
   */
  private async runStartedPhase(state: MaintenanceRunState, phase: AdmissionMessagingMaintenancePhase, timing: { phaseStarted: number; phaseDeadlineAtMilliseconds: number }): Promise<AdmissionMessagingMaintenancePhaseSnapshot | null> {
    const { phaseStarted } = timing, controller = new AbortController();
    try {
      const original = this.work.runPhase({ phase, deadlineAtMilliseconds: state.deadlineAtMilliseconds, signal: controller.signal, run: state.run, phaseDeadlineAtMilliseconds: timing.phaseDeadlineAtMilliseconds });
      const observed = await observeWithin(original, this.remaining(state.deadlineAtMilliseconds), () => controller.abort());
      if (!observed.settled) {
        state.deadlineReached = true;
        updatePhase(state, projectAdmissionMaintenancePhase(phase, { status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.unresolved, reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached, metrics: [], hasRemainingWork: true }, { startedAtMilliseconds: phaseStarted, finishedAtMilliseconds: this.runtime.now() }));
        state.lateWrites.push(this.observeLatePhase(state, phase, original, phaseStarted));
        return null;
      }
      return projectAdmissionMaintenancePhase(phase, observed.value, { startedAtMilliseconds: phaseStarted, finishedAtMilliseconds: this.runtime.now() });
    } catch (error) { return projectAdmissionMaintenancePhase(phase, this.failure(error, state.runId, phase), { startedAtMilliseconds: phaseStarted, finishedAtMilliseconds: this.runtime.now() }); }
  }

  /** @param state - Current run. @returns Nothing after running the fixed phases in lease order until a deadline, an unrecorded start or a known authority stop. */
  private async runPhases(state: MaintenanceRunState): Promise<void> {
    const order = [...ADMISSION_MESSAGING_MAINTENANCE_PHASES.slice(state.run.firstPhaseIndex), ...ADMISSION_MESSAGING_MAINTENANCE_PHASES.slice(0, state.run.firstPhaseIndex)];
    for (const [index, phase] of order.entries()) {
      if (this.runtime.now() >= state.workDeadlineAtMilliseconds) { state.deadlineReached = true; break; }
      const phaseStarted = this.runtime.now();
      const phaseDeadlineAtMilliseconds = admissionMaintenancePhaseDeadline(phaseStarted, state.workDeadlineAtMilliseconds, order.length - index);
      if (!(await this.startPhase(state, phase, phaseStarted))) break;
      if (this.remaining(state.deadlineAtMilliseconds) <= 0) { state.deadlineReached = true; updatePhase(state, { ...createUnstartedAdmissionMaintenancePhase(phase), reason: ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded }); break; }
      const snapshot = await this.runStartedPhase(state, phase, { phaseStarted, phaseDeadlineAtMilliseconds });
      if (!snapshot) break;
      updatePhase(state, snapshot);
      state.pendingSettled = snapshot;
      if (snapshot.reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.authorityUnavailable || snapshot.reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.recoveryLocked) break;
    }
    if (state.pendingSettled) await this.recordSettled(state, state.pendingSettled);
  }

  /** @param state - Current run after its phases. @returns The final result; late observations finish the run under the host lifecycle. */
  private async finishRun(state: MaintenanceRunState): Promise<AdmissionMessagingMaintenanceResult> {
    const { run, runId } = state;
    state.deadlineReached ||= this.remaining(state.deadlineAtMilliseconds) <= 0;
    if (state.lateWrites.length) {
      this.runtime.defer(Promise.all(state.lateWrites).then(async () => { await this.progress.finish(run, state.phases, true, state.observationBudgetMilliseconds); }).catch((error: unknown) => this.report(runId, error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.finish)));
      return { runId, status: ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.incomplete, newRunStarted: true, deadlineReached: true, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.pending, phases: state.phases, health: run.health };
    }
    try {
      const original = this.progress.finish(run, state.phases, state.deadlineReached, state.observationBudgetMilliseconds), observed = await observeWithin(original, this.remaining(state.deadlineAtMilliseconds));
      if (!observed.settled) {
        this.runtime.defer(original.then(() => undefined).catch((error: unknown) => this.report(runId, error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.finish)));
        return { runId, status: ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.incomplete, newRunStarted: true, deadlineReached: true, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.pending, phases: state.phases, health: run.health };
      }
      state.deadlineReached ||= observed.value.deadlineReached;
      return { runId, status: !state.observationUnavailable && observed.value.completed && admissionMaintenanceCompleted(state.phases, state.deadlineReached) ? ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.completed : ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.incomplete, newRunStarted: true, deadlineReached: state.deadlineReached, observation: state.observationUnavailable ? ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable : ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded, phases: state.phases, health: observed.value.health };
    } catch (error) {
      this.report(runId, error, ADMISSION_MESSAGING_MAINTENANCE_OPERATION.finish);
      return { runId, status: ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.incomplete, newRunStarted: true, deadlineReached: this.remaining(state.deadlineAtMilliseconds) <= 0, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable, phases: state.phases, health: run.health };
    }
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
    const deadlines: MaintenanceDeadlines = { runId, deadlineAtMilliseconds, workDeadlineAtMilliseconds: deadlineAtMilliseconds - finishReserveMilliseconds };
    const phases = createUnstartedAdmissionMaintenancePhases();
    const begun = await this.begin(deadlines, phases);
    if ("result" in begun) return begun.result;
    const { run } = begun;
    const state: MaintenanceRunState = { ...deadlines, run, observationBudgetMilliseconds: Math.max(0, deadlineAtMilliseconds - (run.clockObservedAtMilliseconds ?? this.runtime.now())), phases, deadlineReached: false, observationUnavailable: false, lateWrites: [], pendingSettled: null };
    await this.runPhases(state);
    return this.finishRun(state);
  }
}
