/** Selects one request without accepting browser account, role or permission markers. @module admission-review-history-query */
import type { AdmissionReviewHistoryFilters } from "../../domain/repositories/admission-review-history-reader";

/** Resource/correlation fields are resolved before invoking the native current-scope reader. */
export type AdmissionReviewHistoryQuery = AdmissionReviewHistoryFilters & { tribeId: string; admissionRequestId: string; requestId: string };
