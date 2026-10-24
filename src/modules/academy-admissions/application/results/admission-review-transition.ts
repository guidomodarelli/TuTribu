/** Reconciles a confirmed decision with the current reviewer view without replacing newer facts. @module admission-review-transition */
import type { AdmissionReviewDto } from "./admission-flow-result-schemas";
import type { AdmissionReviewSelection } from "./admission-review-selection";
import type { AdmissionTransitionResult } from "../../domain/repositories/admission-repositories";

/** @param review - Current own view of one request. @param transition - Confirmed original result. @returns The same view for another/older result, or its minimal terminal reconciliation. */
export function applyAdmissionReviewTransition(review: AdmissionReviewDto, transition: AdmissionTransitionResult): AdmissionReviewDto {
  if (review.id !== transition.admissionRequestId || review.version >= transition.version) return review;
  return {
    ...review, status: transition.status, version: transition.version,
    eligibleActions: [], needsVerification: false, pendingAgeThresholdReached: false, eligibilityReasons: [], restrictions: { ...review.restrictions, requiresExceptionReason: false },
  };
}

/** @param review - Reconciled visible row whose source, search and submission date did not change. @param filters - Applied selection. @returns Whether the fields changed by this decision still match; unrelated rows are never selected here. */
export function matchesAdmissionReviewTransitionSelection(review: AdmissionReviewDto, filters: AdmissionReviewSelection): boolean {
  return (filters.status === undefined || review.status === filters.status)
    && (filters.needsVerification === undefined || review.needsVerification === filters.needsVerification)
    && (filters.requiresExceptionReason === undefined || review.restrictions.requiresExceptionReason === filters.requiresExceptionReason);
}
