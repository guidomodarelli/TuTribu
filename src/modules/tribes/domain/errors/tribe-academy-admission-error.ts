/** Keeps a failed historical academy entry typed, with its database cause server-side. @module tribe-academy-admission-error */

/** Closed reason of a failed historical academy entry. */
export type TribeAcademyAdmissionErrorCode = "join_failed";

export const TRIBE_ACADEMY_ADMISSION_ERROR_CODE = {
  joinFailed: "join_failed",
} as const satisfies Record<string, TribeAcademyAdmissionErrorCode>;

/** Wraps the real database error of the historical entry (its SQLSTATE stays in the cause chain). */
export class TribeAcademyAdmissionError extends Error {
  /** @param code - Closed failure reason. @param options - Original database error. */
  constructor(readonly code: TribeAcademyAdmissionErrorCode, options?: ErrorOptions) {
    super(`TribeAcademyAdmission.join failed: ${code}`, options);
    this.name = "TribeAcademyAdmissionError";
  }
}
