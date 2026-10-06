/** Preserves a closed ledger outcome and private causes without exposing claim or fingerprint data. */
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
export type AdmissionOperationErrorCode = (typeof ADMISSION_ERROR_CODE)[keyof typeof ADMISSION_ERROR_CODE];

/** Carries only an actually registered operation id when completion is indeterminate. */
export class AdmissionOperationError extends Error {
  /** @param code - Closed own outcome. @param options - Private cause and a recorded client operation identity. */
  constructor(public readonly code: AdmissionOperationErrorCode, options?: ErrorOptions & { operationId?: string }) {
    super(`AdmissionOperationRepository.run failed: ${code}`, options);
    this.name = "AdmissionOperationError";
    this.operationId = options?.operationId;
  }
  readonly operationId: string | undefined;
}
