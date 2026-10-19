/** Health thresholds of the admission maintenance driver shown to leaders. @module admission-maintenance-health */

/** The driver runs every minute; ten missed runs mean it stopped, so the activity view warns after this age. */
export const ADMISSION_MAINTENANCE_STALE_AFTER_MS = 10 * 60 * 1000;
