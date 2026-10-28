/** Derives drafts, pending changes and the guided entry point from current settings without effects. @module admission-notification-settings-plan */
import type { AdmissionNotificationPreferenceMode } from "@/src/modules/notifications/domain/entities/admission-notification-preference";
import type { AdmissionNotificationPreferenceView, AdmissionNotificationEmailSettingsView } from "@/src/modules/notifications/application/results/admission-notification-settings-result";
import type { AdmissionNotificationEmailSettingsDraft } from "@/src/modules/notifications/application/commands/admission-notification-email-settings-draft";
import { type AdmissionNotificationSettingsEmailPlan, ADMISSION_NOTIFICATION_SETTINGS_EMAIL_PLAN as EMAIL_PLAN  } from "@/src/modules/notifications/constants/admission-notification-settings-browser";
import { ADMISSION_NOTIFICATION_PREFERENCE_SOURCE as SOURCE } from "@/src/modules/notifications/constants/admission-notification-preference";
import { ADMISSION_NOTIFICATION_RECOMMENDED_MODE } from "@/src/modules/notifications/constants/admission-notification-settings-options";
import { ADMISSION_EMAIL_SETTINGS_IMPLICIT_VERSION } from "@/src/modules/notifications/constants/admission-notification-email-settings";
import { ADMISSION_NOTIFICATION_SETTINGS_TIME_ZONE_MAX_LENGTH } from "@/src/modules/notifications/constants/admission-notification-settings-http";

/** @param preference - Current saved preference. @returns The saved choice, or the recommended one while nothing is saved yet. */
export function draftModeFor(preference: AdmissionNotificationPreferenceView): AdmissionNotificationPreferenceMode {
  return preference.source === SOURCE.implicit ? ADMISSION_NOTIFICATION_RECOMMENDED_MODE : preference.mode;
}

/** @param preference - Current saved preference. @param mode - Chosen frequency. @returns Whether saving must write the preference: a role default is never a saved choice. */
export function hasPreferenceChange(preference: AdmissionNotificationPreferenceView, mode: AdmissionNotificationPreferenceMode): boolean {
  return preference.source === SOURCE.implicit || preference.mode !== mode;
}

/** @param email - Current tribe email, or null when the viewer cannot configure it. @returns The editable fields shown for that state. */
export function draftFromEmail(email: AdmissionNotificationEmailSettingsView | null): AdmissionNotificationEmailSettingsDraft {
  return { enabled: email?.enabled ?? false, timeZone: email?.timeZone ?? "" };
}

/** @param email - Current tribe email. @param draft - Edited fields. @returns The time zone to send; a disabled email keeps the saved zone because its field is hidden. */
export function emailTimeZoneFor(email: AdmissionNotificationEmailSettingsView, draft: AdmissionNotificationEmailSettingsDraft): string {
  return draft.enabled ? draft.timeZone.trim() : email.timeZone;
}

/** @param email - Current tribe email, or null for a viewer without that authority. @param draft - Edited fields. @returns Whether the tribe email differs from what is saved. */
export function hasEmailChange(email: AdmissionNotificationEmailSettingsView | null, draft: AdmissionNotificationEmailSettingsDraft): boolean {
  return email !== null && (draft.enabled !== email.enabled || emailTimeZoneFor(email, draft) !== email.timeZone);
}

/** Facts of the current recovery state that decide the email part of a save. */
type EmailPlanInput = { email: AdmissionNotificationEmailSettingsView | null; draft: AdmissionNotificationEmailSettingsDraft; pending: boolean; canRetry: boolean };
/** @param input - Current email, draft and original recovery state. @returns What the final save does with the tribe email; an original always wins over a new edit. */
export function emailPlanFor({ email, draft, pending, canRetry }: EmailPlanInput): AdmissionNotificationSettingsEmailPlan {
  if (pending) return canRetry ? EMAIL_PLAN.retry : EMAIL_PLAN.blocked;
  return hasEmailChange(email, draft) ? EMAIL_PLAN.save : EMAIL_PLAN.unchanged;
}

/** @param preference - Current saved preference. @param email - Current tribe email, or null. @param pending - Whether an original email command is retained. @returns Whether everything is saved, so the page opens on the summary instead of the steps. */
export function isSettled(preference: AdmissionNotificationPreferenceView, email: AdmissionNotificationEmailSettingsView | null, pending: boolean): boolean {
  return !pending && preference.source === SOURCE.stored && (email === null || email.version > ADMISSION_EMAIL_SETTINGS_IMPLICIT_VERSION);
}

/** @param email - Current tribe email. @returns Whether the tribe never saved its email, so the browser zone may be suggested. */
export function isUnconfiguredEmail(email: AdmissionNotificationEmailSettingsView | null): boolean {
  return email !== null && email.version === ADMISSION_EMAIL_SETTINGS_IMPLICIT_VERSION;
}

/** @param timeZone - Browser zone, null before hydration. @returns The zone when this runtime recognizes it and it fits the public bound; otherwise null. */
export function usableTimeZone(timeZone: string | null): string | null {
  if (!timeZone || timeZone.length > ADMISSION_NOTIFICATION_SETTINGS_TIME_ZONE_MAX_LENGTH) return null;
  // An unknown IANA zone throws RangeError: the field then keeps the tribe's saved zone.
  try { return new Intl.DateTimeFormat(undefined, { timeZone }).resolvedOptions().timeZone ? timeZone : null; } catch { return null; }
}
