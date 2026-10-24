/** Serializes only own public reviewer selection fields for same-origin reads and navigation. @module admission-review-selection */
import type { AdmissionReviewSelection } from "@/src/modules/academy-admissions/application/results/admission-review-selection";

/** @param filters - Normalized applied own selection. @returns Allowlisted HTTP fields retaining both explicit booleans and an absent all-status restriction. */
export function admissionReviewSelectionQuery(filters: AdmissionReviewSelection): Record<string, string> {
  return {
    limit: String(filters.limit),
    ...(filters.status !== undefined ? { status: filters.status } : {}),
    ...(filters.source !== undefined ? { source: filters.source } : {}),
    ...(filters.search !== undefined ? { search: filters.search } : {}),
    ...(filters.needsVerification !== undefined ? { needsVerification: String(filters.needsVerification) } : {}),
    ...(filters.requiresExceptionReason !== undefined ? { requiresExceptionReason: String(filters.requiresExceptionReason) } : {}),
    ...(filters.submittedFrom !== undefined ? { submittedFrom: filters.submittedFrom } : {}),
    ...(filters.submittedUntil !== undefined ? { submittedUntil: filters.submittedUntil } : {}),
  };
}
