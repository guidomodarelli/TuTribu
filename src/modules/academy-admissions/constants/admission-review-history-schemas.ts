/** Guards only the owned public history DTO, never PostgreSQL rows or provider payloads. @module admission-review-history-schemas */
import { z } from "zod";
import type { AdmissionReviewHistoryActorKind, AdmissionReviewHistoryEventKind } from "../domain/entities/admission-review-history-event";
import type { AdmissionRequest } from "../domain/entities/admission-request";
import { ADMISSION_REQUEST_STATUS } from "./admission-request";
import { ADMISSION_QUERY_LIMIT } from "./admission-public-contract";
import { ADMISSION_REVIEW_HISTORY_ACTOR, ADMISSION_REVIEW_HISTORY_EVENT } from "./admission-review-history";

/** Public dates are display instants; the continuation keeps its independent original precision. */
export type AdmissionReviewHistoryItemDto = {
  id: string; eventType: AdmissionReviewHistoryEventKind;
  fromStatus: AdmissionRequest["status"] | null; toStatus: AdmissionRequest["status"] | null;
  resourceVersion: number | null; actorKind: AdmissionReviewHistoryActorKind; createdAt: string;
};
/** The enclosing scope prevents a page from silently becoming general tribe history. */
export type AdmissionReviewHistoryPageDto = { tribeId: string; admissionRequestId: string; items: AdmissionReviewHistoryItemDto[]; nextCursor: string | null };

/** Explicit public facts exclude actor identifiers, arbitrary causes and metadata. */
const admissionReviewHistoryItemSchema = z.strictObject({
  id: z.uuid(), eventType: z.enum(ADMISSION_REVIEW_HISTORY_EVENT),
  fromStatus: z.enum(ADMISSION_REQUEST_STATUS).nullable(), toStatus: z.enum(ADMISSION_REQUEST_STATUS).nullable(),
  resourceVersion: z.int().positive().max(Number.MAX_SAFE_INTEGER).nullable(), actorKind: z.enum(ADMISSION_REVIEW_HISTORY_ACTOR), createdAt: z.iso.datetime({ precision: 3 }),
});
/** The page carries a single selected resource, a bounded list and no transport or permission fields. */
export const admissionReviewHistoryPageSchema: z.ZodType<AdmissionReviewHistoryPageDto> = z.strictObject({
  tribeId: z.uuid(), admissionRequestId: z.uuid(), items: z.array(admissionReviewHistoryItemSchema).max(ADMISSION_QUERY_LIMIT.maximumPageSize),
  nextCursor: z.string().min(1).max(ADMISSION_QUERY_LIMIT.cursorCharacters).nullable(),
});
