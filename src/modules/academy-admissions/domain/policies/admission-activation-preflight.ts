/** Evaluates private cutover inventory without inventing missing state or claiming a provider capability. @module admission-activation-preflight */
import { ADMISSION_PREFLIGHT_REASON } from "../../constants/admission-preflight";

/** The actual owner derives these facts under locks; none is accepted from a browser confirmation. */
export type AdmissionActivationInventory = {
  tribeId: string; isAcademy: boolean; policyPresent: boolean; markerConsistent: boolean;
  storagePrepared: boolean; ingressProtected: boolean; runtimePrepared: boolean;
  evaluatorEnabled: boolean; recoveryLocked: boolean;
};
export type AdmissionPreflightReason = "preflight_scope_mismatch" | "preflight_academy_unavailable" | "preflight_policy_unavailable" | "preflight_marker_inconsistent" | "preflight_storage_unavailable" | "preflight_ingress_unprotected" | "preflight_runtime_unavailable" | "preflight_evaluator_disabled" | "preflight_recovery_locked";

/**
 * Requires complete current inventory before the activation owner can propose a cutover.
 * @param tribeId - Exact server-authorized target.
 * @param inventory - Locked storage/entrypoint/runtime facts. Commercial memberships no longer block: the first activation converts them.
 * @returns Closed readiness plus safe reasons; it grants no permission, changes no snapshots and does not activate a marker.
 */
export function evaluateAdmissionActivationPreflight(tribeId: string, inventory: AdmissionActivationInventory): { prepared: boolean; reasons: AdmissionPreflightReason[] } {
  if (inventory.tribeId !== tribeId) return { prepared: false, reasons: [ADMISSION_PREFLIGHT_REASON.scopeMismatch] };
  const reasons: AdmissionPreflightReason[] = [];
  if (!inventory.isAcademy) reasons.push(ADMISSION_PREFLIGHT_REASON.academyUnavailable);
  if (!inventory.policyPresent) reasons.push(ADMISSION_PREFLIGHT_REASON.policyUnavailable);
  if (!inventory.markerConsistent) reasons.push(ADMISSION_PREFLIGHT_REASON.markerInconsistent);
  if (!inventory.storagePrepared) reasons.push(ADMISSION_PREFLIGHT_REASON.storageUnavailable);
  if (!inventory.ingressProtected) reasons.push(ADMISSION_PREFLIGHT_REASON.ingressUnprotected);
  if (!inventory.runtimePrepared) reasons.push(ADMISSION_PREFLIGHT_REASON.runtimeUnavailable);
  if (!inventory.evaluatorEnabled) reasons.push(ADMISSION_PREFLIGHT_REASON.evaluatorDisabled);
  if (inventory.recoveryLocked) reasons.push(ADMISSION_PREFLIGHT_REASON.recoveryLocked);
  return { prepared: reasons.length === 0, reasons };
}
