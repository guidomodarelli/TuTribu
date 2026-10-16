/** Owns bounded reviewer query inputs without carrying native authority or provider contracts. @module admission-review-input */
import { z } from "zod";
import { ADMISSION_REQUEST_STATUS } from "./admission-request";
import { ADMISSION_PUBLIC_SOURCE, ADMISSION_QUERY_LIMIT, ADMISSION_REVIEW_CURSOR_SEPARATOR } from "./admission-public-contract";
import { admissionPageSizeSchema } from "./admission-route-input";

/** Retains SQL timestamp precision and the explicit request tie breaker. */
const reviewCursorSchema = z.string().max(ADMISSION_QUERY_LIMIT.cursorCharacters)
  .transform((cursor) => cursor.split(ADMISSION_REVIEW_CURSOR_SEPARATOR))
  .pipe(z.tuple([z.iso.datetime({ offset: true }), z.uuid()]))
  .transform(([submittedAt, id]) => ({ submittedAt, id }));

/** Own query booleans are explicit strings at the transport boundary. */
export const ADMISSION_REVIEW_BOOLEAN_QUERY = { yes: "true", no: "false" } as const;
/** A missing derived filter differs from either explicit boolean selection. */
const reviewBooleanQuerySchema = z.enum(ADMISSION_REVIEW_BOOLEAN_QUERY).transform((value) => value === ADMISSION_REVIEW_BOOLEAN_QUERY.yes);

/** Bounds both inbound selections and their public normalized projection without inferring a timezone. */
export const admissionReviewDateRangeSchema = z.strictObject({
  submittedFrom: z.iso.datetime({ offset: true }).optional(),
  submittedUntil: z.iso.datetime({ offset: true }).optional(),
}).refine((query) => !query.submittedFrom || !query.submittedUntil || new Date(query.submittedFrom) <= new Date(query.submittedUntil));

/** Derived selections describe the current public projection, never the original presentation or approval authority. */
export const admissionReviewQuerySchema = admissionReviewDateRangeSchema.safeExtend({
  limit: admissionPageSizeSchema,
  cursor: reviewCursorSchema.optional(),
  search: z.string().trim().max(ADMISSION_QUERY_LIMIT.searchCharacters).optional(),
  status: z.enum(ADMISSION_REQUEST_STATUS).optional(),
  source: z.enum(ADMISSION_PUBLIC_SOURCE).optional(),
  needsVerification: reviewBooleanQuerySchema.optional(),
  requiresExceptionReason: reviewBooleanQuerySchema.optional(),
});
