/** Retains an own maintenance reason and private cause without copying an upstream payload. @module admission-messaging-maintenance-error */
import type { AdmissionMessagingMaintenanceReason } from "../repositories/admission-messaging-maintenance";

/** Separates a protected workflow failure from a confirmed zero count. */
export class AdmissionMessagingMaintenanceError extends Error {
  /** @param reason - Closed own failure reason. @param options - Original private cause, never serialized in the result DTO. */
  constructor(readonly reason: AdmissionMessagingMaintenanceReason, options?: ErrorOptions) { super(reason, options); }
}
