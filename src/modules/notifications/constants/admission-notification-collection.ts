/** Owns private source collection outcomes independently of transport and admission decisions. @module admission-notification-collection-constants */
/** Records a newly stored logical source without claiming a frozen outbox intent. */
export const ADMISSION_NOTIFICATION_COLLECTED = "collected";
/** Returns historical membership without treating it as current dispatch authority. */
export const ADMISSION_NOTIFICATION_COLLECTION_EXISTING = "existing";
/** Keeps absent or crossed original notices closed. */
export const ADMISSION_NOTIFICATION_COLLECTION_UNAVAILABLE = "unavailable";
/** Refuses to append to a bucket that has already been closed. */
export const ADMISSION_NOTIFICATION_COLLECTION_BUCKET_CLOSED = "bucket_closed";
