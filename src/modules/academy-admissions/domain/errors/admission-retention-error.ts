/** Preserves private retention failure without claiming irreversible material destruction has committed. @module admission-retention-error */
import { ADMISSION_IMPORT_MATERIAL_RETENTION } from "../../constants/admission-retention";
/** Describes the closed private maintenance boundary independently of SQL/transport exception messages. */
export type AdmissionRetentionErrorCode = "invalid_input" | "permission_denied" | "resource_unavailable" | "operation_unresolved";
/** Keeps the operation-specific safe diagnostic separate from its private original cause. */
export class AdmissionRetentionError extends Error {
  /** @param code - Stable rejection or indeterminate commit outcome. @param options - Private original diagnostic cause. */
  constructor(public readonly code: AdmissionRetentionErrorCode, options?: ErrorOptions) {
    super(`AdmissionRetention.${ADMISSION_IMPORT_MATERIAL_RETENTION.operation} failed: ${code}`, options);
    this.name = "AdmissionRetentionError";
  }
}
