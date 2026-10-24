/** Owns bounded private source progress independently of dispatch or public operations. @module admission-notification-collection-progress-constants */
/** Names the private per-tribe checkpoint and its storage invariants. */
export const ADMISSION_NOTIFICATION_COLLECTION_PROGRESS_STORAGE = {
  table: "admission_notification_collection_progress",
  versionCheck: "admission_notification_collection_progress_version_check",
  countsCheck: "admission_notification_collection_progress_counts_check",
  receiptCheck: "admission_notification_collection_progress_receipt_check",
  cursorCheck: "admission_notification_collection_progress_cursor_check",
  audienceCheck: "admission_notification_collection_progress_audience_check",
  clockCheck: "admission_notification_collection_progress_clock_check",
  certificationCheck: "admission_notification_collection_progress_certification_check",
} as const;
/** Names the private retries of unavailable sources that hold incremental certification back until examined again. */
export const ADMISSION_NOTIFICATION_COLLECTION_RETRY_STORAGE = {
  table: "admission_notification_collection_retries",
  positionIndex: "admission_notification_collection_retries_position_idx",
  clockCheck: "admission_notification_collection_retries_clock_check",
} as const;
