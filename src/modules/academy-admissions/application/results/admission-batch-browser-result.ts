/** Binds browser batch acknowledgements and original recovery to the exact confirmed selection. @module admission-batch-browser-result */
import type { AdmissionBrowserBatchDecision } from "../ports/admission-review-browser-client";
import type { AdmissionBatchResultDto } from "./admission-flow-result-schemas";
import type { AdmissionOperationRecoveryDto } from "./admission-operation-recovery";
import type { AdmissionBatchReviewIntent } from "./admission-review-intent";
import type { AdmissionTransitionResult } from "../../domain/repositories/admission-repositories";
import { projectAdmissionBatchDecisionResult } from "./admission-batch-decision-result";
import { ADMISSION_BATCH_DECISION_OPERATION } from "../../constants/admission-batch-decision";
import { ADMISSION_BATCH_ITEM_STATUS, ADMISSION_DECISION } from "../../constants/admission-public-contract";
import { OPERATION_STATE } from "@/src/constants/operation-state";

/** @param intent - Immutable local original. @returns Only the allowlisted public command; names never leave browser recovery storage. */
export function createAdmissionBatchDecisionInput(intent: AdmissionBatchReviewIntent): AdmissionBrowserBatchDecision {
  return { ...intent.input, items: intent.selection.map((item) => ({ requestId: item.requestId, expectedVersion: item.expectedVersion })) };
}

/** @param input - Exact explicit command. @param result - Already validated own public DTO. @returns Whether the atomic original contains only that selection, decision and confirmed versions. */
export function matchesAdmissionBatchDecisionResult(input: AdmissionBrowserBatchDecision, result: AdmissionBatchResultDto): boolean {
  if (result.operationId.toLowerCase() !== input.operationId.toLowerCase() || result.items.length !== input.items.length) return false;
  const selected = new Map(input.items.map((item) => [item.requestId.toLowerCase(), item.expectedVersion]));
  if (selected.size !== input.items.length) return false;
  const expectedStatus = input.decision === ADMISSION_DECISION.approve ? ADMISSION_BATCH_ITEM_STATUS.approved : ADMISSION_BATCH_ITEM_STATUS.rejected;
  for (const item of result.items) {
    const expectedVersion = selected.get(item.requestId.toLowerCase());
    if (expectedVersion === undefined || !selected.delete(item.requestId.toLowerCase())) return false;
    if (!matchesAdmissionBatchItem({ state: result.state, item, expectedStatus, expectedVersion })) return false;
  }
  return selected.size === 0;
}

/** @returns Whether one row reports the status its operation state allows: unresolved while started, the confirmed decision at the next version, or a closed failure. */
function matchesAdmissionBatchItem({ state, item, expectedStatus, expectedVersion }: { state: AdmissionBatchResultDto["state"]; item: AdmissionBatchResultDto["items"][number]; expectedStatus: AdmissionBatchResultDto["items"][number]["status"]; expectedVersion: number }): boolean {
  if (state === OPERATION_STATE.started) return item.status === ADMISSION_BATCH_ITEM_STATUS.unresolved;
  if (item.status === ADMISSION_BATCH_ITEM_STATUS.approved || item.status === ADMISSION_BATCH_ITEM_STATUS.rejected) return item.status === expectedStatus && item.version === expectedVersion + 1;
  return item.status === ADMISSION_BATCH_ITEM_STATUS.conflict || item.status === ADMISSION_BATCH_ITEM_STATUS.denied;
}

/** @param result - A bound public atomic original. @returns Only confirmed row transitions; conflicts and unresolved rows never become decisions. */
export function getAdmissionBatchReviewTransitions(result: AdmissionBatchResultDto): AdmissionTransitionResult[] {
  if (result.state !== OPERATION_STATE.completed) return [];
  return result.items.flatMap((item) => (item.status === ADMISSION_BATCH_ITEM_STATUS.approved || item.status === ADMISSION_BATCH_ITEM_STATUS.rejected) && item.version !== undefined ? [{ admissionRequestId: item.requestId, status: item.status, version: item.version }] : []);
}

/** @param intent - Original local selection and body. @param operation - Allowlisted original operation read, never current resource state. @returns Its safe public batch projection, or null when the original cannot belong to this intent. */
export function projectAdmissionBatchReviewRecovery(intent: AdmissionBatchReviewIntent, operation: AdmissionOperationRecoveryDto): AdmissionBatchResultDto | null {
  if (operation.type !== ADMISSION_BATCH_DECISION_OPERATION || operation.operationId.toLowerCase() !== intent.input.operationId.toLowerCase()) return null;
  try {
    const projected = projectAdmissionBatchDecisionResult(intent.input.operationId, intent.selection.map((item) => ({ admissionRequestId: item.requestId, expectedVersion: item.expectedVersion })), operation);
    return matchesAdmissionBatchDecisionResult(createAdmissionBatchDecisionInput(intent), projected) ? projected : null;
  } catch {
    // A foreign or unusable own original stays unresolved; the caller must not dispatch again.
    return null;
  }
}
