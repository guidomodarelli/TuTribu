/** Retains an own maintenance reason and private cause without copying an upstream payload. @module admission-messaging-maintenance-error */
import type { AdmissionMessagingMaintenanceReason } from "../repositories/admission-messaging-maintenance";

/** Deepest cause link inspected for a maintenance rejection wrapped by an owner; owners wrap it at most a few times. */
const MAINTENANCE_ERROR_CAUSE_DEPTH = 6;

/** Separates a protected workflow failure from a confirmed zero count. */
export class AdmissionMessagingMaintenanceError extends Error {
  /** Closed reason exposed as `code`, so private diagnostics summarize it like every other own error. */
  readonly code: AdmissionMessagingMaintenanceReason;

  /** @param reason - Closed own failure reason. @param options - Original private cause, never serialized in the result DTO. */
  constructor(readonly reason: AdmissionMessagingMaintenanceReason, options?: ErrorOptions) {
    super(reason, options);
    this.name = "AdmissionMessagingMaintenanceError";
    this.code = reason;
  }
}

/**
 * Finds the maintenance rejection behind an owner wrapper. Each owner wraps every foreign error as its own unresolved failure, but a
 * maintenance guard (deadline, lease authority or recovery lock) rejects inside the owner's single transaction before its commit,
 * so the transaction rolled back and the wrapper's uncertainty does not apply.
 * @param error - Failure reported by a phase or one of its owners.
 * @returns The outermost maintenance error in the cause chain, or null when none is present.
 */
export function findAdmissionMessagingMaintenanceError(error: unknown): AdmissionMessagingMaintenanceError | null {
  let current = error;
  for (let depth = 0; depth < MAINTENANCE_ERROR_CAUSE_DEPTH && current instanceof Error; depth++) {
    if (current instanceof AdmissionMessagingMaintenanceError) return current;
    current = current.cause;
  }
  return null;
}
