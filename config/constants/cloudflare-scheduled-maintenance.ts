/** Owns the existing Cloudflare maintenance dispatch vocabulary. @module cloudflare-scheduled-maintenance-constants */
export const IMAGE_CLEANUP_MAINTENANCE_PATH = "/api/maintenance/image-cleanup";
export const FILE_CLEANUP_MAINTENANCE_PATH = "/api/maintenance/file-cleanup";
export const EVENT_REMINDERS_MAINTENANCE_PATH = "/api/maintenance/event-reminders";
export const MAINTENANCE_CRON_SCHEDULE = { eventReminders: "*/5 * * * *", fileCleanup: "30 4 * * *", imageCleanup: "0 4 * * *" } as const;
export const CRON_AUTHORIZATION_SCHEME = "Bearer";
/** Re-enters the generated Worker fetch handler without sending this request to a public origin. */
export const INTERNAL_WORKER_ORIGIN = "https://worker.internal";
export const MAINTENANCE_REQUEST_METHOD = "GET";
/** Preserves legacy cleanup diagnostics independently of the admission trigger's typed outcomes. */
export const SCHEDULED_MAINTENANCE_ERROR = { missingSecret: "Scheduled maintenance cleanup skipped: CRON_SECRET is not configured on the Cloudflare Worker", requestFailed: "Scheduled maintenance cleanup request failed with status" } as const;
