/** Projects an exact original batch into bounded public row feedback without private notes. @module admission-batch-decision-result */
import type { AdmissionOperationResult } from "../../domain/entities/admission-operation";
import type { AdmissionBatchDecisionSelection, AdmissionBatchDecisionSnapshot } from "../../domain/repositories/admission-batch-decision-writer";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "../../constants/admission-errors";
import { ADMISSION_BATCH_ITEM_STATUS, ADMISSION_BATCH_RESULT } from "../../constants/admission-public-contract";
import { ADMISSION_BATCH_DECISION_MESSAGE } from "../../constants/admission-batch-result-presentation";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { admissionBatchResultSchema } from "./admission-flow-result-schemas";

/**
 * Binds every public row to the caller's exact explicit selection and original operation.
 * @param operationId - Original client identity, never a replacement generated after uncertainty.
 * @param selection - Selected IDs in presentation order; original versions remain in the writer intent.
 * @param original - A confirmed original snapshot or genuinely registered progress from the atomic owner.
 * @returns Safe counts, terminal summary and per-row status in the explicit selection order.
 * @throws AdmissionOperationError when the own result names another operation or selection.
 */
export function projectAdmissionBatchDecisionResult(operationId: string, selection: readonly AdmissionBatchDecisionSelection[], original: AdmissionOperationResult<AdmissionBatchDecisionSnapshot>) {
  if (original.operationId.toLowerCase() !== operationId.toLowerCase()) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
  if (original.state === OPERATION_STATE.started) {
    return admissionBatchResultSchema.parse({
      operationId, state: OPERATION_STATE.started, result: ADMISSION_BATCH_RESULT.incomplete,
      completedCount: 0, failedCount: 0, unresolvedCount: selection.length,
      items: selection.map((item) => ({ requestId: item.admissionRequestId, status: ADMISSION_BATCH_ITEM_STATUS.unresolved, code: ADMISSION_ERROR_CODE.operationUnresolved, safeMessage: ADMISSION_ERROR_MESSAGE.operation_unresolved })),
    });
  }
  const resultsById = new Map(original.result.results.map((item) => [item.admissionRequestId.toLowerCase(), item]));
  if (original.result.results.length !== selection.length || resultsById.size !== selection.length || selection.some((item) => !resultsById.has(item.admissionRequestId.toLowerCase()))) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
  const items = selection.map((selected) => {
    const result = resultsById.get(selected.admissionRequestId.toLowerCase())!;
    return "version" in result
      ? { requestId: selected.admissionRequestId, status: result.status, version: result.version, safeMessage: ADMISSION_BATCH_DECISION_MESSAGE[result.status] }
      : { requestId: selected.admissionRequestId, status: result.status, code: result.code, safeMessage: ADMISSION_ERROR_MESSAGE[result.code] };
  });
  const completedCount = items.filter((item) => item.status === ADMISSION_BATCH_ITEM_STATUS.approved || item.status === ADMISSION_BATCH_ITEM_STATUS.rejected).length;
  const failedCount = items.length - completedCount;
  return admissionBatchResultSchema.parse({
    operationId, state: OPERATION_STATE.completed,
    result: completedCount > 0 && failedCount > 0 ? ADMISSION_BATCH_RESULT.mixed : failedCount > 0 ? ADMISSION_BATCH_RESULT.allRejected : ADMISSION_BATCH_RESULT.allSucceeded,
    completedCount, failedCount, unresolvedCount: 0, items,
  });
}
