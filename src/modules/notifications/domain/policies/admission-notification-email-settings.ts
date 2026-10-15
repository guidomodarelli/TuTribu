/** Plans explicit independent email epochs without sending messages or changing admission policy. @module admission-notification-email-settings-policy */
import { BUENOS_AIRES_TIME_ZONE } from "@/src/constants/date-time";
import { ADMISSION_EMAIL_SETTINGS_IMPLICIT_VERSION, ADMISSION_EMAIL_SETTINGS_REJECTION, ADMISSION_EMAIL_SETTINGS_STATUS } from "../../constants/admission-notification-email-settings";
import type { AdmissionNotificationEmailSettings } from "../entities/admission-notification";
import type { AdmissionNotificationEmailSettingsChangeFacts, AdmissionNotificationEmailSettingsChangePlan } from "../entities/admission-notification-email-settings";

/** @param tribeId - Exact server-owned tenant. @param stored - Current native record or true absence. @returns Owned settings or a read-only OFF default; null rejects crossed scope. */
export function resolveAdmissionNotificationEmailSettings(tribeId: string, stored: AdmissionNotificationEmailSettings | null): AdmissionNotificationEmailSettings | null {
  if (stored && stored.tribeId !== tribeId) return null;
  return { tribeId, enabled: stored?.enabled ?? false, version: stored?.version ?? ADMISSION_EMAIL_SETTINGS_IMPLICIT_VERSION, enabledAtMicroseconds: stored?.enabledAtMicroseconds ?? null, timeZone: stored?.timeZone ?? BUENOS_AIRES_TIME_ZONE };
}

/**
 * Plans a CAS-protected change and starts a new cut for every effective enabled epoch.
 * @param facts - Fresh authorized owner facts; the zone and command are validated at their input boundary.
 * @returns A proposed write, a precise no-op or an expected rejection. No provider, preference or OTP state is changed.
 */
export function planAdmissionNotificationEmailSettingsChange(facts: AdmissionNotificationEmailSettingsChangeFacts): AdmissionNotificationEmailSettingsChangePlan {
  const current = resolveAdmissionNotificationEmailSettings(facts.tribeId, facts.stored);
  if (!current) return { status: ADMISSION_EMAIL_SETTINGS_STATUS.rejected, reason: ADMISSION_EMAIL_SETTINGS_REJECTION.scopeMismatch };
  if (facts.change.expectedVersion !== current.version) return { status: ADMISSION_EMAIL_SETTINGS_STATUS.rejected, reason: ADMISSION_EMAIL_SETTINGS_REJECTION.versionConflict };
  if (facts.change.enabled === current.enabled && facts.change.timeZone === current.timeZone) return { status: ADMISSION_EMAIL_SETTINGS_STATUS.unchanged, settings: current };
  if (facts.change.enabled && (!facts.preparedEmail.available || facts.preparedEmail.tribeId !== facts.tribeId)) return { status: ADMISSION_EMAIL_SETTINGS_STATUS.rejected, reason: ADMISSION_EMAIL_SETTINGS_REJECTION.capabilityUnavailable };
  return { status: ADMISSION_EMAIL_SETTINGS_STATUS.changed, settings: { tribeId: facts.tribeId, enabled: facts.change.enabled, timeZone: facts.change.timeZone, version: current.version + 1, enabledAtMicroseconds: facts.change.enabled ? facts.nowMicroseconds : null } };
}
