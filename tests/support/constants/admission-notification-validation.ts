/** Bounds only owned-branch calendar validation, without changing production job deadlines. @module admission-notification-validation */
import { MICROSECONDS_PER_SECOND, SECONDS_PER_MINUTE } from "@/src/constants/time";

export const ADMISSION_NOTIFICATION_CALENDAR_TEST_TIMEOUT_MS = 120_000;

/** Bounds full-journal owned-branch storage validation, without changing any product lifetime. */
export const ADMISSION_NOTIFICATION_STORAGE_TEST_TIMEOUT_MS = 600_000;

/** Bounds full-journal preparation plus a genuine five-minute group boundary, without altering production clocks or global test timeouts. */
export const ADMISSION_NOTIFICATION_GROUP_PREPARATION_TEST_TIMEOUT_MS = 900_000;

/** Keeps each genuine-clock fixture wait short enough for observable bounded progress. */
export const ADMISSION_NOTIFICATION_GROUP_TEST_WAIT_SLICE_MS = 30_000;

/** Leaves three real minutes for network-bound collection before the same five-minute bucket closes. */
export const ADMISSION_NOTIFICATION_GROUP_TEST_COLLECTION_HEADROOM_MICROSECONDS = 3 * SECONDS_PER_MINUTE * MICROSECONDS_PER_SECOND;
