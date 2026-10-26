/** Validates history runtime params and the independent cursor once before native composition. @module admission-review-history-page-input */
import { z } from "zod";
import { ADMISSION_NAVIGATION } from "./admission-navigation";
import { ADMISSION_REVIEW_HISTORY_NAVIGATION } from "./admission-review-history-page";
import { ADMISSION_REVIEW_ALL_STATUSES } from "./admission-review-selection";
import { admissionReviewNavigationQuerySchema } from "./admission-review-page-input";
import { admissionReviewDateRangeSchema, admissionReviewQuerySchema } from "./admission-review-input";
import { admissionTribeParamsSchema } from "./admission-route-input";

/** Zod omits cannot preserve object refinements; reuse the field shape and retain the original date-range refinement once. */
const { [ADMISSION_NAVIGATION.requestQuery]: _selectedRequest, ...historyNavigationShape } = admissionReviewNavigationQuerySchema.shape;

/** Reuses the exact review cursor protocol while translating its timestamp into the history port vocabulary. */
export const admissionReviewHistoryPageInputSchema = z.strictObject({
  params: admissionTribeParamsSchema.safeExtend({ requestId: z.uuid().transform((requestId) => requestId.toLowerCase()) }),
  query: admissionReviewDateRangeSchema.safeExtend({
    ...historyNavigationShape,
    [ADMISSION_REVIEW_HISTORY_NAVIGATION.cursorQuery]: admissionReviewQuerySchema.shape.cursor.transform((cursor) => cursor ? { at: cursor.submittedAt, id: cursor.id.toLowerCase() } : undefined),
  }).transform((query) => ({ ...query, status: query.status === ADMISSION_REVIEW_ALL_STATUSES ? undefined : query.status })),
});
