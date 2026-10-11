/** Preserves private expiration failures without claiming a confirmed maintenance result. @module admission-expiration-error */
import type { AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_EXPIRATION_OPERATION } from "@/src/modules/academy-admissions/constants/admission-expiration";

/** Carries an actionable operation and original cause for the maintenance boundary. */
export class AdmissionExpirationError extends Error {
  /** @param code - Closed validation, authority or completion failure. @param options - Original private failure when available. */
  constructor(public readonly code: AdmissionErrorCode, options?: ErrorOptions) {
    super(`AdmissionRequestExpiration.${ADMISSION_EXPIRATION_OPERATION} failed: ${code}`, options);
    this.name = "AdmissionExpirationError";
  }
}
