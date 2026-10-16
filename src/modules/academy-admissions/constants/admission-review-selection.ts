/** Owns normalized reviewer selections independently of HTTP string coercion. @module admission-review-selection */
import { z } from "zod";
import type { AdmissionReviewFilters } from "../domain/repositories/admission-review-reader";
import { ADMISSION_REQUEST_STATUS } from "./admission-request";
import { ADMISSION_QUERY_LIMIT } from "./admission-public-contract";
import { admissionReviewDateRangeSchema, admissionReviewQuerySchema } from "./admission-review-input";

/** Only page navigation needs a sentinel to distinguish all statuses from its initial pending default. */
export const ADMISSION_REVIEW_ALL_STATUSES = "all";
/** Fresh inbox navigation starts with the oldest pending requests. */
export const DEFAULT_ADMISSION_REVIEW_SELECTION = { limit: ADMISSION_QUERY_LIMIT.defaultPageSize, status: ADMISSION_REQUEST_STATUS.pending } as const satisfies Omit<AdmissionReviewFilters, "cursor">;
/** Public props retain native booleans and numeric limits, never HTTP coercion or cursor authority. */
export const admissionReviewSelectionSchema = admissionReviewDateRangeSchema.safeExtend({
  limit: z.int().min(1).max(ADMISSION_QUERY_LIMIT.maximumPageSize),
  status: admissionReviewQuerySchema.shape.status,
  source: admissionReviewQuerySchema.shape.source,
  search: admissionReviewQuerySchema.shape.search,
  needsVerification: z.boolean().optional(),
  requiresExceptionReason: z.boolean().optional(),
});
