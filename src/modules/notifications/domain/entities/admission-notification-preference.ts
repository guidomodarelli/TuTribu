/** Models private admission notice preferences independently of provider availability. @module admission-notification-preference */

/** Selects the required initial external-email frequency without enabling the channel. */
export type AdmissionNotificationPreferenceMode = "individual" | "grouped" | "daily" | "omitted";

/** Identifies why a private preference cannot be read or changed in the current scope. */
export type AdmissionNotificationPreferenceRejectionReason =
  | "notification_preference_reviewer_required"
  | "notification_preference_scope_mismatch"
  | "notification_preference_version_conflict";

/** Contains current native reviewer facts; browser commands cannot supply these fields. */
export type AdmissionNotificationPreferenceContext = {
  readonly tribeId: string;
  readonly recipientUserId: string;
  readonly currentRole: string | null;
  readonly membershipStatus: string | null;
};

/** Preserves the exact database-owned effective timestamp and explicit account/tribe scope. */
export type AdmissionNotificationPreference = {
  readonly tribeId: string;
  readonly recipientUserId: string;
  readonly mode: AdmissionNotificationPreferenceMode;
  readonly version: number;
  readonly effectiveFrom: string;
};

/** Distinguishes an unstored role default from an explicit preference retained across role changes. */
export type AdmissionNotificationPreferenceSnapshot = {
  readonly tribeId: string;
  readonly recipientUserId: string;
  readonly mode: AdmissionNotificationPreferenceMode;
  readonly version: number;
  readonly effectiveFrom: string | null;
  readonly source: "implicit" | "stored";
};

/** Carries only the user's requested choice and its original optimistic-concurrency version. */
export type AdmissionNotificationPreferenceChange = {
  readonly mode: AdmissionNotificationPreferenceMode;
  readonly expectedVersion: number;
};

/** Denies access or stale intent without returning another recipient's preference. */
export type AdmissionNotificationPreferenceRejection = {
  readonly status: "rejected";
  readonly reason: AdmissionNotificationPreferenceRejectionReason;
};

/** Resolves either a current explicit preference or its read-only role default. */
export type AdmissionNotificationPreferenceResolution =
  | { readonly status: "resolved"; readonly preference: AdmissionNotificationPreferenceSnapshot }
  | AdmissionNotificationPreferenceRejection;

/** Describes a database-only write or a true no-op; persistence remains the caller's responsibility. */
export type AdmissionNotificationPreferenceChangePlan =
  | { readonly status: "changed"; readonly preference: AdmissionNotificationPreference }
  | { readonly status: "unchanged"; readonly preference: AdmissionNotificationPreference }
  | AdmissionNotificationPreferenceRejection;
