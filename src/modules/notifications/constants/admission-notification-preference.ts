/** Owns admission preference contracts without coupling them to connection or verification state. @module admission-notification-preference-constants */
import type { AdmissionNotificationPreferenceMode, AdmissionNotificationPreferenceRejectionReason } from "../domain/entities/admission-notification-preference";

/** Requests a separate delivery for each eligible event. */
const ADMISSION_NOTIFICATION_PREFERENCE_INDIVIDUAL = "individual";
/** Groups eligible events in the five-minute window required by the feature. */
const ADMISSION_NOTIFICATION_PREFERENCE_GROUPED = "grouped";
/** Requests the daily digest in the tribe's configured time zone. */
const ADMISSION_NOTIFICATION_PREFERENCE_DAILY = "daily";
/** Suppresses optional external email while internal notices retain their own authorization. */
const ADMISSION_NOTIFICATION_PREFERENCE_OMITTED = "omitted";

/** Exposes the complete explicit preference vocabulary. */
export const ADMISSION_NOTIFICATION_PREFERENCE_MODE = {
  individual: ADMISSION_NOTIFICATION_PREFERENCE_INDIVIDUAL,
  grouped: ADMISSION_NOTIFICATION_PREFERENCE_GROUPED,
  daily: ADMISSION_NOTIFICATION_PREFERENCE_DAILY,
  omitted: ADMISSION_NOTIFICATION_PREFERENCE_OMITTED,
} as const satisfies Record<AdmissionNotificationPreferenceMode, AdmissionNotificationPreferenceMode>;

/** Represents a role default that has never been persisted. */
export const ADMISSION_NOTIFICATION_PREFERENCE_IMPLICIT_VERSION = 0;

/** Resolves current facts without creating a stored preference. */
const ADMISSION_NOTIFICATION_PREFERENCE_RESOLVED = "resolved";
/** Records an explicit new choice or a changed existing choice. */
const ADMISSION_NOTIFICATION_PREFERENCE_CHANGED = "changed";
/** Preserves the original explicit choice and effective timestamp. */
const ADMISSION_NOTIFICATION_PREFERENCE_UNCHANGED = "unchanged";
/** Refuses an unauthorized, cross-scope or stale preference request. */
const ADMISSION_NOTIFICATION_PREFERENCE_REJECTED = "rejected";

/** Owns the closed result discriminators used by the private model. */
export const ADMISSION_NOTIFICATION_PREFERENCE_STATUS = {
  resolved: ADMISSION_NOTIFICATION_PREFERENCE_RESOLVED,
  changed: ADMISSION_NOTIFICATION_PREFERENCE_CHANGED,
  unchanged: ADMISSION_NOTIFICATION_PREFERENCE_UNCHANGED,
  rejected: ADMISSION_NOTIFICATION_PREFERENCE_REJECTED,
} as const;

/** Identifies the effective default without implying a persisted subscription. */
const ADMISSION_NOTIFICATION_PREFERENCE_IMPLICIT_SOURCE = "implicit";
/** Identifies an explicit choice made by the recipient. */
const ADMISSION_NOTIFICATION_PREFERENCE_STORED_SOURCE = "stored";

/** Preserves the distinction between implicit defaults and explicit choices. */
export const ADMISSION_NOTIFICATION_PREFERENCE_SOURCE = {
  implicit: ADMISSION_NOTIFICATION_PREFERENCE_IMPLICIT_SOURCE,
  stored: ADMISSION_NOTIFICATION_PREFERENCE_STORED_SOURCE,
} as const;

/** Requires a current active reviewer before consulting any stored preference. */
const ADMISSION_NOTIFICATION_PREFERENCE_REVIEWER_REQUIRED = "notification_preference_reviewer_required";
/** Refuses to project a preference from another tribe or recipient. */
const ADMISSION_NOTIFICATION_PREFERENCE_SCOPE_MISMATCH = "notification_preference_scope_mismatch";
/** Keeps a stale command from rewriting a newer choice or delivery epoch. */
const ADMISSION_NOTIFICATION_PREFERENCE_VERSION_CONFLICT = "notification_preference_version_conflict";

/** Owns closed private business reasons, ready for a safe application mapper. */
export const ADMISSION_NOTIFICATION_PREFERENCE_REJECTION = {
  reviewerRequired: ADMISSION_NOTIFICATION_PREFERENCE_REVIEWER_REQUIRED,
  scopeMismatch: ADMISSION_NOTIFICATION_PREFERENCE_SCOPE_MISMATCH,
  versionConflict: ADMISSION_NOTIFICATION_PREFERENCE_VERSION_CONFLICT,
} as const satisfies Record<string, AdmissionNotificationPreferenceRejectionReason>;
