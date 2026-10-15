/** Names independent email configuration outcomes without provider or authentication details. @module admission-notification-email-settings-constants */
import { ADMISSION_NOTIFICATION_EMAIL_CAPABILITY_UNAVAILABLE, ADMISSION_NOTIFICATION_SCOPE_MISMATCH } from "./admission-notification-groups";

/** Represents an absent configuration without creating a persisted row. */
export const ADMISSION_EMAIL_SETTINGS_IMPLICIT_VERSION = 0;
/** Separates effective writes, no-ops and expected configuration rejections. */
export const ADMISSION_EMAIL_SETTINGS_STATUS = { changed: "changed", unchanged: "unchanged", rejected: "rejected" } as const;
/** Requires the exact originally observed email configuration before any write or no-op. */
export const ADMISSION_EMAIL_SETTINGS_VERSION_CONFLICT = "email_settings_version_conflict";
/** Keeps scoped owner failures distinct from a stale resource version. */
export const ADMISSION_EMAIL_SETTINGS_REJECTION = { scopeMismatch: ADMISSION_NOTIFICATION_SCOPE_MISMATCH, versionConflict: ADMISSION_EMAIL_SETTINGS_VERSION_CONFLICT, capabilityUnavailable: ADMISSION_NOTIFICATION_EMAIL_CAPABILITY_UNAVAILABLE } as const;
/** Gives the original ledger one purpose independent of OTP and admission-rule edits. */
export const ADMISSION_EMAIL_SETTINGS_OPERATION = "update_admission_email_settings";
/** Selects only reconstructible configuration metadata; addresses and provider details are excluded. */
export const ADMISSION_EMAIL_SETTINGS_AUDIT = { resource: "admission_email_settings", event: "admission_email_settings_changed" } as const;
