/** Decides whether the leader activity view must warn that the admission maintenance stopped. @module admission-maintenance-staleness */
import type { AdmissionMetricsResult } from "@/src/modules/academy-admissions/application/results/admission-metrics-result";
import { ADMISSION_MAINTENANCE_STALE_AFTER_MS } from "@/src/modules/academy-admissions/constants/admission-maintenance-health";

/** `never` means the maintenance started but no run ever completed every phase; `stale` carries the age of the last complete run. */
export type AdmissionMaintenanceStaleness = { kind: "never" } | { kind: "stale"; ageMs: number } | null;

/**
 * Measures against the server observation time, so the server and the first client render agree.
 * When the bounded maintenance exists, only a run that completed every phase counts: loose completed phases
 * (dispatches, materializations, worker runs) never hide a maintenance that keeps stopping on its budget.
 * Deployments where it never started keep the previous signal, the last committed positive effect.
 * @param metrics - Own aggregate observed by the server.
 * @returns The warning to show, or null when the maintenance looks healthy.
 */
export function resolveAdmissionMaintenanceStaleness(metrics: Pick<AdmissionMetricsResult, "asOf" | "lastSuccessfulRun" | "maintenance">): AdmissionMaintenanceStaleness {
  const reference = metrics.maintenance ? metrics.maintenance.lastCompletedAt : metrics.lastSuccessfulRun?.at ?? null;
  if (reference === null) return metrics.maintenance ? { kind: "never" } : null;
  const ageMs = new Date(metrics.asOf).getTime() - new Date(reference).getTime();
  return ageMs > ADMISSION_MAINTENANCE_STALE_AFTER_MS ? { kind: "stale", ageMs } : null;
}
