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

/** A missing derived filter differs from either explicit boolean selection. */
const reviewBooleanQuerySchema = z.enum(["true", "false"]).transform((value) => value === "true");

/** Derived selections describe the current public projection, never the original presentation or approval authority. */
export const admissionReviewQuerySchema = z.strictObject({
  limit: admissionPageSizeSchema,
  cursor: reviewCursorSchema.optional(),
  search: z.string().trim().max(ADMISSION_QUERY_LIMIT.searchCharacters).optional(),
  status: z.enum(ADMISSION_REQUEST_STATUS).optional(),
  source: z.enum(ADMISSION_PUBLIC_SOURCE).optional(),
  needsVerification: reviewBooleanQuerySchema.optional(),
  requiresExceptionReason: reviewBooleanQuerySchema.optional(),
  submittedFrom: z.iso.datetime({ offset: true }).optional(),
  submittedUntil: z.iso.datetime({ offset: true }).optional(),
}).refine((query) => !query.submittedFrom || !query.submittedUntil || new Date(query.submittedFrom) <= new Date(query.submittedUntil));
