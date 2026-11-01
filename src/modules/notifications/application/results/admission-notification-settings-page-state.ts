/** Defines only safe current reviewer settings props; native session and provider facts never enter the browser. @module admission-notification-settings-page-state */
import type { AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import type { AdmissionNotificationPreferenceReadResult, AdmissionNotificationEmailSettingsView } from "./admission-notification-settings-result";

/**
 * Viewer and tribe ids isolate local intentions; they do not authorize a mutation. `platformRequirement` says why the platform cannot
 * protect a tribe email change right now (only the TuTribu team resolves it); it is null for a viewer who cannot configure that email.
 */
export type AdmissionNotificationSettingsPageState =
  | ({ kind: "ready"; slug: string; tribeId: string; viewerId: string; email: AdmissionNotificationEmailSettingsView | null; platformRequirement: PlatformSecurityRequirement | null } & AdmissionNotificationPreferenceReadResult)
  | { kind: "unavailable"; code: AdmissionErrorCode; message: string };
