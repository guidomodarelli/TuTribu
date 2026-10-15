/** Defines only safe current reviewer settings props; native session and provider facts never enter the browser. @module admission-notification-settings-page-state */
import type { AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { AdmissionNotificationPreferenceReadResult, AdmissionNotificationEmailSettingsView } from "./admission-notification-settings-result";

/** Viewer and tribe ids isolate local intentions; they do not authorize a mutation. */
export type AdmissionNotificationSettingsPageState =
  | ({ kind: "ready"; slug: string; tribeId: string; viewerId: string; email: AdmissionNotificationEmailSettingsView | null } & AdmissionNotificationPreferenceReadResult)
  | { kind: "unavailable"; code: AdmissionErrorCode; message: string };
