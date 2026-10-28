/** Projects retained facts into the minimal owned history DTO, never a storage row. @module admission-review-history-result */
import type { AdmissionReviewHistoryEvent } from "../../domain/entities/admission-review-history-event";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { admissionReviewHistoryPageSchema, type AdmissionReviewHistoryPageDto } from "../../constants/admission-review-history-schemas";

/** @param tribeId - Native selected tribe. @param admissionRequestId - Actual authorized request. @param records - Own domain facts already bound to that scope. @param nextCursor - Exact continuation from the reader. @returns A validated allowlisted DTO without private fields. */
export function projectAdmissionReviewHistory(tribeId: string, admissionRequestId: string, records: readonly AdmissionReviewHistoryEvent[], nextCursor: string | null): AdmissionReviewHistoryPageDto {
  const parsed = admissionReviewHistoryPageSchema.safeParse({ tribeId, admissionRequestId, items: records.map((event) => ({
    id: event.id, eventType: event.eventType, fromStatus: event.fromStatus, toStatus: event.toStatus,
    resourceVersion: event.resourceVersion, actorKind: event.actorKind, createdAt: event.createdAt.toISOString(),
  })), nextCursor });
  if (!parsed.success) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable, { cause: parsed.error });
  return parsed.data;
}
