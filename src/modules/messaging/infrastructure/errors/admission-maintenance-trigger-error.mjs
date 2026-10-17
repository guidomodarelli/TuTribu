/** Keeps trigger failures typed while retaining their private causes for the owning runtime. @module admission-maintenance-trigger-error */
import { ADMISSION_MAINTENANCE_TRIGGER_MESSAGE, ADMISSION_MAINTENANCE_TRIGGER_ERROR_NAME } from "../../constants/admission-maintenance-trigger.mjs";

/** Represents an omitted, rejected or uncertain invocation without implying that its effects rolled back. */
export class AdmissionMaintenanceTriggerError extends Error {
  /**
   * Preserves only a closed code and optional HTTP status as public diagnostics.
   * @param {import('../../constants/admission-maintenance-trigger.mjs').AdmissionMaintenanceTriggerErrorCode} code - Closed trigger outcome.
   * @param {{ status?: number; cause?: unknown }} [options] - Safe HTTP metadata and an unexposed original cause.
   */
  constructor(code, options = {}) {
    super(ADMISSION_MAINTENANCE_TRIGGER_MESSAGE[code], { cause: options.cause });
    this.name = ADMISSION_MAINTENANCE_TRIGGER_ERROR_NAME;
    this.code = code;
    this.status = options.status;
  }
}
