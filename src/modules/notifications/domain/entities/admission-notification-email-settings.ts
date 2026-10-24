/** Defines independent versioned email configuration without enabling OTP or transport. @module admission-notification-email-settings */
import type { AdmissionNotificationEmailSettings } from "./admission-notification";

/** Contains only the explicit desired email state, zone and originally observed resource version. */
export type AdmissionNotificationEmailSettingsChange = { readonly expectedVersion: number; readonly enabled: boolean; readonly timeZone: string };
/** Supplies current server-owned scope, tested email availability and a native post-lock clock. */
export type AdmissionNotificationEmailSettingsChangeFacts = {
  readonly tribeId: string;
  readonly stored: AdmissionNotificationEmailSettings | null;
  readonly change: AdmissionNotificationEmailSettingsChange;
  readonly preparedEmail: { readonly tribeId: string; readonly available: boolean };
  readonly nowMicroseconds: number;
};
/** Keeps expected conflicts distinct from unexpected storage/runtime failures. */
export type AdmissionNotificationEmailSettingsRejectionReason = "notification_scope_mismatch" | "email_settings_version_conflict" | "email_capability_unavailable";
/** Describes a proposal only; the original authorized transaction must persist and recheck it. */
export type AdmissionNotificationEmailSettingsChangePlan =
  | { readonly status: "changed" | "unchanged"; readonly settings: AdmissionNotificationEmailSettings }
  | { readonly status: "rejected"; readonly reason: AdmissionNotificationEmailSettingsRejectionReason };
