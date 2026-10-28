/** Maps selected native workflow columns without schema-validating PostgreSQL rows. @module admission-messaging-maintenance-mapper */
import type { AdmissionMessagingMaintenanceExternalScope, AdmissionMessagingMaintenanceHealth, AdmissionMessagingMaintenancePhaseSnapshot, AdmissionMessagingMaintenanceRun } from "../../domain/repositories/admission-messaging-maintenance";
import { AdmissionMessagingMaintenanceError } from "../../domain/errors/admission-messaging-maintenance-error";
import { ADMISSION_MESSAGING_MAINTENANCE_REASON } from "../../constants/admission-messaging-maintenance";

/** Retains native timestamp projections as textual integers until the own internal result boundary. */
export type AdmissionMessagingMaintenanceRow = { run_id: string; version: number; state: "running" | "completed" | "incomplete"; external_environment: string | null; external_security_epoch: string | null; first_phase: number; next_phase: number; started_milliseconds: string; last_successful_milliseconds: string | null; lease_live: boolean; deadline_live: boolean; deadline_reached: boolean; phases: AdmissionMessagingMaintenancePhaseSnapshot[] };

/** @param row - SQL-owned scope columns whose nullability is constrained together. @returns The original optional external scope, without credentials. */
export function admissionMaintenanceExternalScope(row: AdmissionMessagingMaintenanceRow): AdmissionMessagingMaintenanceExternalScope | null {
  if (row.external_environment === null) return null;
  if (row.external_security_epoch === null) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved);
  return { environment: row.external_environment, securityEpoch: row.external_security_epoch };
}

/** @param phases - Own persisted phase observations. @returns Explicit result fields only; private unexpected extras are never copied. */
export function projectStoredAdmissionMaintenancePhases(phases: readonly AdmissionMessagingMaintenancePhaseSnapshot[]): AdmissionMessagingMaintenancePhaseSnapshot[] {
  return phases.map((phase) => ({ phase: phase.phase, status: phase.status, reason: phase.reason, metrics: phase.metrics.map((metric) => ({ key: metric.key, value: metric.value })), hasRemainingWork: phase.hasRemainingWork, startedAtMilliseconds: phase.startedAtMilliseconds, durationMilliseconds: phase.durationMilliseconds, observation: phase.observation, late: phase.late }));
}

/** @param row - Original selected run, after all lease waits. @param health - Native metadata observed in that original transaction. @param clockObservedAtMilliseconds - Host receipt of its SQL clock, before further asynchronous guards. @returns The original private frame; it grants no future business authority. */
export function admissionMaintenanceRun(row: AdmissionMessagingMaintenanceRow, health: AdmissionMessagingMaintenanceHealth, clockObservedAtMilliseconds: number): AdmissionMessagingMaintenanceRun {
  return { runId: row.run_id, startedAtMilliseconds: Number(row.started_milliseconds), clockObservedAtMilliseconds, firstPhaseIndex: row.first_phase, externalScope: admissionMaintenanceExternalScope(row), health };
}
