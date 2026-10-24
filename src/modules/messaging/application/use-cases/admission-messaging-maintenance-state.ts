/** Projects only own maintenance evidence and keeps unknown health separate from an empty queue. @module admission-messaging-maintenance-state */
import type { AdmissionMessagingMaintenanceHealth, AdmissionMessagingMaintenancePhase, AdmissionMessagingMaintenancePhaseOutput, AdmissionMessagingMaintenancePhaseSnapshot, AdmissionMessagingMaintenanceResult } from "../../domain/repositories/admission-messaging-maintenance";
import { ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION, ADMISSION_MESSAGING_MAINTENANCE_PHASES, ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS, ADMISSION_MESSAGING_MAINTENANCE_REASON, ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS } from "../../constants/admission-messaging-maintenance";

/** @returns One explicit not-started observation for every fixed phase; no zero count is claimed as completed. */
export function createUnstartedAdmissionMaintenancePhases(): AdmissionMessagingMaintenancePhaseSnapshot[] {
  return ADMISSION_MESSAGING_MAINTENANCE_PHASES.map(createUnstartedAdmissionMaintenancePhase);
}

/** @param phase - Actual fixed original phase. @returns Its explicit not-started evidence without claiming completed work. */
export function createUnstartedAdmissionMaintenancePhase(phase: AdmissionMessagingMaintenancePhase): AdmissionMessagingMaintenancePhaseSnapshot {
  return { phase, status: ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.notRun, reason: null, metrics: [], hasRemainingWork: false, startedAtMilliseconds: null, durationMilliseconds: null, observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.notRun, late: false };
}

/** @returns Explicitly unknown queue/health instead of a synthetic successful zero. */
export function createUnavailableAdmissionMaintenanceHealth(): AdmissionMessagingMaintenanceHealth {
  return { available: false, observedAtMilliseconds: null, lastSuccessfulRunAtMilliseconds: null, oldestQueuedAtMilliseconds: null, queueAgeMilliseconds: null };
}

/** @param phase - Actual fixed original phase. @param output - Own minimal work evidence; unexpected extra fields are not copied. @param startedAtMilliseconds - Original host start. @param finishedAtMilliseconds - Actual observation time. @param late - Whether the original effect settled after the bounded response. @returns An independent snapshot without private adapter/provider fields. */
export function projectAdmissionMaintenancePhase(phase: AdmissionMessagingMaintenancePhase, output: AdmissionMessagingMaintenancePhaseOutput, startedAtMilliseconds: number, finishedAtMilliseconds: number, late = false): AdmissionMessagingMaintenancePhaseSnapshot {
  return { phase, status: output.status, reason: output.reason, metrics: output.metrics.map((metric) => ({ key: metric.key, value: metric.value })), hasRemainingWork: output.hasRemainingWork, startedAtMilliseconds, durationMilliseconds: Math.max(0, Math.ceil(finishedAtMilliseconds - startedAtMilliseconds)), observation: ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.pending, late };
}

/**
 * @param startedAtMilliseconds - Host clock when the phase starts.
 * @param workDeadlineAtMilliseconds - Last instant at which any phase may still be started (run deadline minus the finish reserve).
 * @param phasesLeft - This phase plus the phases still waiting in this run.
 * @returns A soft deadline with a fair share of the time left; time unused by quick phases flows to the later ones.
 */
export function admissionMaintenancePhaseDeadline(startedAtMilliseconds: number, workDeadlineAtMilliseconds: number, phasesLeft: number): number {
  const available = Math.max(0, workDeadlineAtMilliseconds - startedAtMilliseconds);
  return startedAtMilliseconds + Math.floor(available / Math.max(1, phasesLeft));
}

/** Phase states that only mean "this run ran out of its own budget", never a failure, missing configuration or uncertainty. */
const BUDGET_ONLY_STATUSES: readonly string[] = [ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.completed, ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.deferred, ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.notRun];

/**
 * @param result - Published bounded run.
 * @returns True when an incomplete run still confirmed and recorded progress and stopped only because of its own budget,
 * so the trigger treats it as a successful bounded invocation; failures, missing configuration and uncertainty stay unsuccessful.
 */
export function admissionMaintenanceMadeProgress(result: AdmissionMessagingMaintenanceResult): boolean {
  return result.status === ADMISSION_MESSAGING_MAINTENANCE_RUN_STATUS.incomplete && result.newRunStarted && result.observation === ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded
    && result.phases.some((phase) => phase.status === ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.completed && phase.observation === ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded)
    && result.phases.every((phase) => BUDGET_ONLY_STATUSES.includes(phase.status) && (phase.reason === null || phase.reason === ADMISSION_MESSAGING_MAINTENANCE_REASON.deadlineReached) && phase.observation !== ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.unavailable);
}

/** @param phases - Every original bounded phase and its observation. @param deadlineReached - Sticky host deadline evidence. @returns True only for a confirmed complete bounded invocation; remaining work is still reported separately. */
export function admissionMaintenanceCompleted(phases: readonly AdmissionMessagingMaintenancePhaseSnapshot[], deadlineReached: boolean): boolean {
  return !deadlineReached && phases.length === ADMISSION_MESSAGING_MAINTENANCE_PHASES.length && phases.every((phase) => phase.status === ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.completed && phase.observation === ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded);
}
