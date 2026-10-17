/** Compares the original optional external scope without granting any authority to a business phase. @module admission-messaging-maintenance-scope */
import type { AdmissionMessagingMaintenanceExternalScope } from "../repositories/admission-messaging-maintenance";

/** @param original - Scope of the original acquired workflow, including absent external configuration. @param current - Fresh key-independent hosting scope. @returns True only while the original scope remains unchanged; configuring an absent scope requires a new workflow. */
export function sameAdmissionMaintenanceExternalScope(original: AdmissionMessagingMaintenanceExternalScope | null, current: AdmissionMessagingMaintenanceExternalScope | null): boolean {
  return original === null ? current === null : current !== null && original.environment === current.environment && original.securityEpoch === current.securityEpoch;
}
