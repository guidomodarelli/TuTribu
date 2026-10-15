/** Projects domain email settings into the same minimal current or historical application result. @module admission-notification-settings-projection */
import type { AdmissionNotificationEmailSettings } from "../../domain/entities/admission-notification";
import type { AdmissionNotificationEmailSettingsView } from "./admission-notification-settings-result";

/** @param settings - Current or original historical owned configuration. @returns Only enabled state, version and zone, without a native identity, cut or provider reference. */
export function toAdmissionNotificationEmailSettingsView(settings: AdmissionNotificationEmailSettings): AdmissionNotificationEmailSettingsView {
  return { enabled: settings.enabled, version: settings.version, timeZone: settings.timeZone };
}
