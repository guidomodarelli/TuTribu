/** Health thresholds of the admission maintenance driver shown to leaders. @module admission-maintenance-health */

import { MILLISECONDS_PER_SECOND, SECONDS_PER_MINUTE } from "@/src/constants/time";

/** The driver runs every minute; this many missed runs mean it stopped. */
const ADMISSION_MAINTENANCE_STALE_AFTER_MINUTES = 10;

/** Age of the last maintenance run after which the activity view warns that the driver stopped. */
export const ADMISSION_MAINTENANCE_STALE_AFTER_MS =
  ADMISSION_MAINTENANCE_STALE_AFTER_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
