/** Publishes a confirmed original command outcome: progress as is, a committed denial as its own error, a grant as the result. @module admission-original-outcome */
import "server-only";
import type { AdmissionOperationResult } from "../../domain/entities/admission-operation";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import type { AdmissionErrorCode } from "../../constants/admission-errors";
import { OPERATION_STATE } from "@/src/constants/operation-state";

/** Known denial committed inside the original ledger instead of an effect. */
type CommittedAdmissionDenial = { outcome: string; code: AdmissionErrorCode };

/**
 * @param result - Committed original snapshot.
 * @returns Whether the original committed a known denial.
 */
function isCommittedDenial(result: object): result is CommittedAdmissionDenial {
  return "outcome" in result;
}

/**
 * @param original - Registered progress or the committed original snapshot.
 * @param cause - Private cause of the denial observed by this call, if any.
 * @returns Progress unchanged, or the completed original with its granted result.
 * @throws AdmissionOperationError carrying the committed denial and its original operation.
 */
export function settleAdmissionOriginal<Grant extends object>(original: AdmissionOperationResult<Grant | CommittedAdmissionDenial>, cause?: unknown): AdmissionOperationResult<Grant> {
  if (original.state === OPERATION_STATE.started) return original;
  const { result } = original;
  if (isCommittedDenial(result)) throw new AdmissionOperationError(result.code, { ...(cause !== undefined ? { cause } : {}), operationId: original.operationId, operationState: OPERATION_STATE.completed });
  return { ...original, result };
}
