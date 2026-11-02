/** Owns fixed safe history-page diagnostics separately from public copy and private exception payloads. @module admission-review-history-observability */
export const ADMISSION_REVIEW_HISTORY_PAGE_DIAGNOSTIC = {
  feature: "academy-admissions", operation: "load_admission_review_history_page",
  readFailed: "Admission request history page read failed",
  contractRejected: "Admission request history page returned unusable own props",
  loadFailed: "Admission request history page composition failed",
} as const;
