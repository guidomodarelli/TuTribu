/** Projects only own maintenance evidence and keeps unknown health separate from an empty queue. @module admission-messaging-maintenance-state */
import type { AdmissionMessagingMaintenanceHealth, AdmissionMessagingMaintenancePhase, AdmissionMessagingMaintenancePhaseOutput, AdmissionMessagingMaintenancePhaseSnapshot } from "../../domain/repositories/admission-messaging-maintenance";
import { ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION, ADMISSION_MESSAGING_MAINTENANCE_PHASES, ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS } from "../../constants/admission-messaging-maintenance";

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

/** @param phases - Every original bounded phase and its observation. @param deadlineReached - Sticky host deadline evidence. @returns True only for a confirmed complete bounded invocation; remaining work is still reported separately. */
export function admissionMaintenanceCompleted(phases: readonly AdmissionMessagingMaintenancePhaseSnapshot[], deadlineReached: boolean): boolean {
  return !deadlineReached && phases.length === ADMISSION_MESSAGING_MAINTENANCE_PHASES.length && phases.every((phase) => phase.status === ADMISSION_MESSAGING_MAINTENANCE_PHASE_STATUS.completed && phase.observation === ADMISSION_MESSAGING_MAINTENANCE_OBSERVATION.recorded);
}
