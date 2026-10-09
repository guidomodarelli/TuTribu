/** Preserves a closed ledger outcome and private causes without exposing claim or fingerprint data. */
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
export type AdmissionOperationErrorCode = (typeof ADMISSION_ERROR_CODE)[keyof typeof ADMISSION_ERROR_CODE];

/** Carries genuine registered progress or a completed own rejection, never a fabricated operation. */
export class AdmissionOperationError extends Error {
  /** @param code - Closed own outcome. @param options - Private cause, recorded client identity and optional owner-confirmed completion. */
  constructor(public readonly code: AdmissionOperationErrorCode, options?: ErrorOptions & { operationId?: string; operationState?: "completed" }) {
    super(`AdmissionOperationRepository.run failed: ${code}`, options);
    this.name = "AdmissionOperationError";
    this.operationId = options?.operationId;
    this.operationState = options?.operationState;
  }
  readonly operationId: string | undefined;
  /** Present only after the owner reads or commits a completed original outcome. */
  readonly operationState: "completed" | undefined;
}
