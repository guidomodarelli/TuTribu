/** Builds allowlisted history/return navigation without interpreting a URL as authority. @module admission-review-history-routes */
import type { AdmissionReviewSelection } from "@/src/modules/academy-admissions/application/results/admission-review-selection";
import { ADMISSION_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-navigation";
import { ADMISSION_REVIEW_ALL_STATUSES } from "@/src/modules/academy-admissions/constants/admission-review-selection";
import { ADMISSION_REVIEW_HISTORY_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-review-history-page";
import { admissionReviewSelectionQuery } from "./admission-review-selection";
import { buildAdmissionReviewSelectionRoute } from "./admission-review-filters";

/** @param slug - Current canonical academy slug. @param requestId - Current exact request UUID. @param filters - Applied inbox selection retained only for return. @param cursor - Optional independent exact history continuation. @returns One same-origin request-history route with no arbitrary return destination. */
export function buildAdmissionReviewHistoryRoute(slug: string, requestId: string, filters: AdmissionReviewSelection, cursor?: string | null): string {
  const query = new URLSearchParams({ ...admissionReviewSelectionQuery(filters), status: filters.status ?? ADMISSION_REVIEW_ALL_STATUSES, ...(cursor ? { [ADMISSION_REVIEW_HISTORY_NAVIGATION.cursorQuery]: cursor } : {}) });
  return `/${encodeURIComponent(slug)}/${ADMISSION_NAVIGATION.reviewSegment}/${ADMISSION_REVIEW_HISTORY_NAVIGATION.segment}/${encodeURIComponent(requestId)}?${query}`;
}

/** @param slug - Current canonical slug. @param requestId - The request whose detail opened history. @param filters - Applied inbox selection. @returns Selected detail with every allowed filter and no history cursor. */
export function buildAdmissionReviewHistoryReturnRoute(slug: string, requestId: string, filters: AdmissionReviewSelection): string {
  return `${buildAdmissionReviewSelectionRoute(slug, filters)}&${new URLSearchParams({ [ADMISSION_NAVIGATION.requestQuery]: requestId })}`;
}
