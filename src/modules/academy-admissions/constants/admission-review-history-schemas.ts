/** Guards only the owned public history DTO, never PostgreSQL rows or provider payloads. @module admission-review-history-schemas */
import { z } from "zod";
import type { AdmissionReviewHistoryPageDto } from "../application/results/admission-review-history-result";
import { ADMISSION_REQUEST_STATUS } from "./admission-request";
import { ADMISSION_QUERY_LIMIT } from "./admission-public-contract";
import { ADMISSION_REVIEW_HISTORY_ACTOR, ADMISSION_REVIEW_HISTORY_EVENT } from "./admission-review-history";

/** Explicit public facts exclude actor identifiers, arbitrary causes and metadata. */
export const admissionReviewHistoryItemSchema = z.strictObject({
  id: z.uuid(), eventType: z.enum(ADMISSION_REVIEW_HISTORY_EVENT),
  fromStatus: z.enum(ADMISSION_REQUEST_STATUS).nullable(), toStatus: z.enum(ADMISSION_REQUEST_STATUS).nullable(),
  resourceVersion: z.int().positive().max(Number.MAX_SAFE_INTEGER).nullable(), actorKind: z.enum(ADMISSION_REVIEW_HISTORY_ACTOR), createdAt: z.iso.datetime({ precision: 3 }),
});
/** The page carries a single selected resource, a bounded list and no transport or permission fields. */
export const admissionReviewHistoryPageSchema: z.ZodType<AdmissionReviewHistoryPageDto> = z.strictObject({
  tribeId: z.uuid(), admissionRequestId: z.uuid(), items: z.array(admissionReviewHistoryItemSchema).max(ADMISSION_QUERY_LIMIT.maximumPageSize),
  nextCursor: z.string().min(1).max(ADMISSION_QUERY_LIMIT.cursorCharacters).nullable(),
});
