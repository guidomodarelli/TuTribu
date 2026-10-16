/** Owns one native page boundary for reviewer selection and an optional exact detail. @module admission-review-page-input */
import { z } from "zod";
import { ADMISSION_NAVIGATION } from "./admission-navigation";
import { ADMISSION_REQUEST_STATUS } from "./admission-request";
import { admissionTribeParamsSchema } from "./admission-route-input";
import { admissionReviewDateRangeSchema, admissionReviewQuerySchema } from "./admission-review-input";
import { ADMISSION_REVIEW_ALL_STATUSES } from "./admission-review-selection";

/** The page defaults to pending; all is explicit and becomes an absent API status restriction. */
const reviewPageQuerySchema = admissionReviewDateRangeSchema.safeExtend({
  [ADMISSION_NAVIGATION.requestQuery]: z.uuid().optional(),
  limit: admissionReviewQuerySchema.shape.limit,
  status: z.union([z.literal(ADMISSION_REVIEW_ALL_STATUSES), admissionReviewQuerySchema.shape.status]).default(ADMISSION_REQUEST_STATUS.pending),
  source: admissionReviewQuerySchema.shape.source,
  search: admissionReviewQuerySchema.shape.search,
  needsVerification: admissionReviewQuerySchema.shape.needsVerification,
  requiresExceptionReason: admissionReviewQuerySchema.shape.requiresExceptionReason,
}).transform((query) => ({ ...query, status: query.status === ADMISSION_REVIEW_ALL_STATUSES ? undefined : query.status }));

/** Selection never accepts account, role, session, tribe authority or an unbounded scan. */
export const admissionReviewPageInputSchema = z.strictObject({ params: admissionTribeParamsSchema, query: reviewPageQuerySchema });
