/** Shares normalized own reviewer filters without exposing HTTP input or native authority. @module admission-review-selection */
import type { AdmissionReviewFilters } from "../../domain/repositories/admission-review-reader";

/** Pagination adds its cursor separately; the applied filters remain stable across scanned pages. */
export type AdmissionReviewSelection = Omit<AdmissionReviewFilters, "cursor">;
