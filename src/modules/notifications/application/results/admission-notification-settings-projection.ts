/** Projects domain email settings into the same minimal current or historical application result. @module admission-notification-settings-projection */
import type { AdmissionNotificationEmailSettings } from "../../domain/entities/admission-notification";
import type { AdmissionNotificationPreference, AdmissionNotificationPreferenceSnapshot } from "../../domain/entities/admission-notification-preference";
import type { AdmissionNotificationEmailSettingsView, AdmissionNotificationPreferenceView } from "./admission-notification-settings-result";
import { ADMISSION_NOTIFICATION_PREFERENCE_SOURCE } from "../../constants/admission-notification-preference";

/** @param preference - Authorized own choice or implicit role default. @returns Frequency, native version and origin without recipient or delivery cuts. */
export function toAdmissionNotificationPreferenceView(preference: AdmissionNotificationPreference | AdmissionNotificationPreferenceSnapshot): AdmissionNotificationPreferenceView {
  return { mode: preference.mode, version: preference.version, source: "source" in preference ? preference.source : ADMISSION_NOTIFICATION_PREFERENCE_SOURCE.stored };
}

/** @param settings - Current or original historical owned configuration. @returns Only enabled state, version and zone, without a native identity, cut or provider reference. */
export function toAdmissionNotificationEmailSettingsView(settings: AdmissionNotificationEmailSettings): AdmissionNotificationEmailSettingsView {
  return { enabled: settings.enabled, version: settings.version, timeZone: settings.timeZone };
}
