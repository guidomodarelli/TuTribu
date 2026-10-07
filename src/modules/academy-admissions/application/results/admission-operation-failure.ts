/** Projects only known owner failures and genuinely registered operation progress. @module admission-operation-failure */
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { admissionFailure } from "./admission-errors";

/**
 * Retains original diagnostics privately without treating an arbitrary exception as durable acceptance.
 * @param error - Actual own writer/resolver failure.
 * @returns An application failure; the HTTP owner separately validates its safe public projection.
 */
export function admissionOperationFailure(error: unknown) {
  return {
    ok: false as const,
    failure: admissionFailure(error instanceof AdmissionOperationError ? error.code : ADMISSION_ERROR_CODE.unexpectedFailure, {
      cause: error,
      ...(error instanceof AdmissionOperationError && error.code === ADMISSION_ERROR_CODE.operationUnresolved && error.operationId ? { operation: { operationId: error.operationId, state: OPERATION_STATE.started } } : {}),
    }),
  };
}
