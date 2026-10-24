/** Describes only the review window the user has already loaded and its optional selected detail. @module admission-review-visible-snapshot */
import type { AdmissionReviewDto } from "./admission-flow-result-schemas";

/** A background read does not load an arbitrary global queue or alter decision drafts. */
export type AdmissionReviewVisibleSnapshot = { readonly items: AdmissionReviewDto[]; readonly nextCursor: string | null; readonly selected: AdmissionReviewDto | null };
