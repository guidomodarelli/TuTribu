/** Names own notification settings routes and bounded public input independently of browser claims. @module admission-notification-settings-http */

/** Provides stable correlation labels for the four explicitly composed operations. */
export const ADMISSION_NOTIFICATION_SETTINGS_HTTP_OPERATION = { preferenceRead: "admission-notification-preference-read", preferenceChange: "admission-notification-preference-change", emailRead: "admission-email-settings-read", emailChange: "admission-email-settings-change" } as const;
/** Bounds an own timezone selection before PostgreSQL resolves whether the name exists. */
export const ADMISSION_NOTIFICATION_SETTINGS_TIME_ZONE_MAX_LENGTH = 128;
