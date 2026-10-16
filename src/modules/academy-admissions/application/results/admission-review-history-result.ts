/** Projects retained facts into the minimal owned history DTO, never a storage row. @module admission-review-history-result */
import type { AdmissionReviewHistoryEvent, AdmissionReviewHistoryActorKind, AdmissionReviewHistoryEventKind } from "../../domain/entities/admission-review-history-event";
import type { AdmissionRequest } from "../../domain/entities/admission-request";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { admissionReviewHistoryPageSchema } from "../../constants/admission-review-history-schemas";

/** Public dates are display instants; the continuation keeps its independent original precision. */
export type AdmissionReviewHistoryItemDto = {
  id: string; eventType: AdmissionReviewHistoryEventKind;
  fromStatus: AdmissionRequest["status"] | null; toStatus: AdmissionRequest["status"] | null;
  resourceVersion: number | null; actorKind: AdmissionReviewHistoryActorKind; createdAt: string;
};
/** The enclosing scope prevents a page from silently becoming general tribe history. */
export type AdmissionReviewHistoryPageDto = { tribeId: string; admissionRequestId: string; items: AdmissionReviewHistoryItemDto[]; nextCursor: string | null };

/** @param tribeId - Native selected tribe. @param admissionRequestId - Actual authorized request. @param records - Own domain facts already bound to that scope. @param nextCursor - Exact continuation from the reader. @returns A validated allowlisted DTO without private fields. */
export function projectAdmissionReviewHistory(tribeId: string, admissionRequestId: string, records: readonly AdmissionReviewHistoryEvent[], nextCursor: string | null): AdmissionReviewHistoryPageDto {
  const parsed = admissionReviewHistoryPageSchema.safeParse({ tribeId, admissionRequestId, items: records.map((event) => ({
    id: event.id, eventType: event.eventType, fromStatus: event.fromStatus, toStatus: event.toStatus,
    resourceVersion: event.resourceVersion, actorKind: event.actorKind, createdAt: event.createdAt.toISOString(),
  })), nextCursor });
  if (!parsed.success) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable, { cause: parsed.error });
  return parsed.data;
}
