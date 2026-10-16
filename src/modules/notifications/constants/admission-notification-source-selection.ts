/** Owns bounded private source traversal independently of optional-email eligibility. @module admission-notification-source-selection-constants */
/** Limits the references examined in one producer transaction; continuation advances even when none can be emailed. */
export const ADMISSION_NOTIFICATION_SOURCE_PAGE_SIZE = 25;
/** Supports seeking original sources by tenant and native event position without an offset scan. */
export const ADMISSION_NOTIFICATION_SOURCE_POSITION_INDEX = "admission_notification_source_position_idx";
