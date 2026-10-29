/** Owns notification event/group contracts and exact product durations. @module admission-notification-groups-constants */
import { MICROSECONDS_PER_SECOND, SECONDS_PER_DAY, SECONDS_PER_MINUTE } from "@/src/constants/time";
import type { AdmissionNotificationEvent, AdmissionNotificationSuppressionReason } from "../domain/entities/admission-notification";

/** Names a pending notification fact, independently of its request's transition vocabulary. */
const ADMISSION_NOTIFICATION_PENDING_EVENT = "pending_created";
/** Names the original approval notice fact. */
const ADMISSION_NOTIFICATION_APPROVED_EVENT = "approved";
/** Names the original rejection notice fact. */
const ADMISSION_NOTIFICATION_REJECTED_EVENT = "rejected";
/** Names an administrative cancellation notice fact. */
const ADMISSION_NOTIFICATION_CANCELLED_EVENT = "cancelled";
/** Names the original expiration notice fact. */
const ADMISSION_NOTIFICATION_EXPIRED_EVENT = "expired";
/** Names a unique time-driven notice, not another request transition. */
const ADMISSION_NOTIFICATION_REMINDER_EVENT = "reminder";
/** Owns the complete persisted obligation event vocabulary. */
export const ADMISSION_NOTIFICATION_EVENT = { pendingCreated: ADMISSION_NOTIFICATION_PENDING_EVENT, approved: ADMISSION_NOTIFICATION_APPROVED_EVENT, rejected: ADMISSION_NOTIFICATION_REJECTED_EVENT, cancelled: ADMISSION_NOTIFICATION_CANCELLED_EVENT, expired: ADMISSION_NOTIFICATION_EXPIRED_EVENT, reminder: ADMISSION_NOTIFICATION_REMINDER_EVENT } as const satisfies Record<string, AdmissionNotificationEvent>;
/** Closes reviewer buckets every five minutes from a stable UTC epoch origin. */
const ADMISSION_NOTIFICATION_GROUPED_MINUTES = 5;
/** Bounds all optional-email retries from the original event, irrespective of grouping. */
const ADMISSION_NOTIFICATION_RETRY_DAYS = 1;
/** Allows one logical pending reminder after three elapsed days. */
const ADMISSION_NOTIFICATION_REMINDER_DAYS = 3;
/** Closes daily digests at nine in the configured tribe time zone. */
export const ADMISSION_NOTIFICATION_DAILY_HOUR = 9;
/** Keeps duration calculations exact at the PostgreSQL microsecond boundary. */
export const ADMISSION_NOTIFICATION_TIMING = { groupedWindowMicroseconds: ADMISSION_NOTIFICATION_GROUPED_MINUTES * SECONDS_PER_MINUTE * MICROSECONDS_PER_SECOND, retryLimitMicroseconds: ADMISSION_NOTIFICATION_RETRY_DAYS * SECONDS_PER_DAY * MICROSECONDS_PER_SECOND, reminderAgeMicroseconds: ADMISSION_NOTIFICATION_REMINDER_DAYS * SECONDS_PER_DAY * MICROSECONDS_PER_SECOND } as const;
/** Names fixed-order private group keys without exposing a provider idempotency contract. */
export const ADMISSION_NOTIFICATION_GROUP_KEY_NAMESPACE = "admission_email_group";
/** Versions the minimal internal manifest separately from a provider payload MAC format. */
export const ADMISSION_NOTIFICATION_GROUP_MANIFEST_FORMAT = 1;

/** Selects the closed prospective-grouping outcome. */
const ADMISSION_NOTIFICATION_CANDIDATE_STATUS = "candidate";
/** Suppresses optional email while preserving the underlying fact and internal notice. */
export const ADMISSION_NOTIFICATION_SUPPRESSED_STATUS = "suppressed";
/** Defers freezing until the exact current window closes. */
const ADMISSION_NOTIFICATION_NOT_DUE_STATUS = "not_due";
/** Reports no prospective members without inventing an expired delivery. */
const ADMISSION_NOTIFICATION_EMPTY_STATUS = "empty";
/** Freezes a minimal reference manifest without granting dispatch authority. */
export const ADMISSION_NOTIFICATION_FROZEN_STATUS = "frozen";
/** Reports that every remaining member exceeded its original deadline. */
export const ADMISSION_NOTIFICATION_EXPIRED_STATUS = "expired";
/** Rejects an inconsistent scope or repeated logical member. */
const ADMISSION_NOTIFICATION_REJECTED_STATUS = "rejected";
/** Owns the private planning outcomes. */
export const ADMISSION_NOTIFICATION_GROUP_STATUS = { candidate: ADMISSION_NOTIFICATION_CANDIDATE_STATUS, suppressed: ADMISSION_NOTIFICATION_SUPPRESSED_STATUS, notDue: ADMISSION_NOTIFICATION_NOT_DUE_STATUS, empty: ADMISSION_NOTIFICATION_EMPTY_STATUS, frozen: ADMISSION_NOTIFICATION_FROZEN_STATUS, expired: ADMISSION_NOTIFICATION_EXPIRED_STATUS, rejected: ADMISSION_NOTIFICATION_REJECTED_STATUS } as const;

/** Refuses mixed account, tribe, request or owner facts. */
export const ADMISSION_NOTIFICATION_SCOPE_MISMATCH = "notification_scope_mismatch";
/** Refuses a recipient who cannot receive this event/audience now. */
const ADMISSION_NOTIFICATION_RECIPIENT_UNAUTHORIZED = "recipient_not_authorized";
/** Refuses an obsolete, premature or expired request event. */
const ADMISSION_NOTIFICATION_EVENT_NOT_CURRENT = "event_not_current";
/** Keeps disabled or uninitialized email closed. */
const ADMISSION_NOTIFICATION_EMAIL_DISABLED = "email_disabled";
/** Refuses to infer trusted account email from an unrelated proof or phone. */
const ADMISSION_NOTIFICATION_ACCOUNT_EMAIL_UNTRUSTED = "account_email_untrusted";
/** Requires the current owner to report a prepared email connection. */
export const ADMISSION_NOTIFICATION_EMAIL_CAPABILITY_UNAVAILABLE = "email_capability_unavailable";
/** Prevents enablement from replaying historical events. */
const ADMISSION_NOTIFICATION_EVENT_PREDATES_EMAIL = "event_predates_email_enablement";
/** Prevents a new preference epoch from replaying previous work. */
const ADMISSION_NOTIFICATION_EVENT_PREDATES_PREFERENCE = "event_predates_preference";
/** Respects a current explicit or role-default omitted choice. */
const ADMISSION_NOTIFICATION_PREFERENCE_OMITTED_REASON = "preference_omitted";
/** Preserves the original elapsed twenty-four-hour deadline. */
const ADMISSION_NOTIFICATION_DEADLINE_EXPIRED = "notification_deadline_expired";
/** Avoids extending retries to reach a preferred calendar window. */
const ADMISSION_NOTIFICATION_DEADLINE_BEFORE_WINDOW = "deadline_before_preferred_window";
/** Keeps a missing or inconsistent daily calendar result closed. */
const ADMISSION_NOTIFICATION_WINDOW_UNAVAILABLE = "notification_window_unavailable";
/** Refuses repeated obligations instead of hiding an identity error by deduping input. */
export const ADMISSION_NOTIFICATION_DUPLICATE_OBLIGATION = "duplicate_notification_obligation";
/** Owns closed grouping reasons without provider messages or contact data. */
export const ADMISSION_NOTIFICATION_GROUP_REASON = { scopeMismatch: ADMISSION_NOTIFICATION_SCOPE_MISMATCH, recipientUnauthorized: ADMISSION_NOTIFICATION_RECIPIENT_UNAUTHORIZED, eventNotCurrent: ADMISSION_NOTIFICATION_EVENT_NOT_CURRENT, emailDisabled: ADMISSION_NOTIFICATION_EMAIL_DISABLED, emailUntrusted: ADMISSION_NOTIFICATION_ACCOUNT_EMAIL_UNTRUSTED, capabilityUnavailable: ADMISSION_NOTIFICATION_EMAIL_CAPABILITY_UNAVAILABLE, eventPredatesEmail: ADMISSION_NOTIFICATION_EVENT_PREDATES_EMAIL, eventPredatesPreference: ADMISSION_NOTIFICATION_EVENT_PREDATES_PREFERENCE, preferenceOmitted: ADMISSION_NOTIFICATION_PREFERENCE_OMITTED_REASON, deadlineExpired: ADMISSION_NOTIFICATION_DEADLINE_EXPIRED, deadlineBeforeWindow: ADMISSION_NOTIFICATION_DEADLINE_BEFORE_WINDOW, windowUnavailable: ADMISSION_NOTIFICATION_WINDOW_UNAVAILABLE } as const satisfies Record<string, AdmissionNotificationSuppressionReason>;
