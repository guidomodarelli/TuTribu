/** Selects own safe notification settings DTO fields without carrying native identities or provider facts. @module admission-notification-settings-mapper */
import { OPERATION_STATE } from "@/src/constants/operation-state";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { AdmissionNotificationPreference, AdmissionNotificationPreferenceSnapshot } from "../../domain/entities/admission-notification-preference";
import type { AdmissionNotificationEmailSettingsChangePlan } from "../../domain/entities/admission-notification-email-settings";
import type { AdmissionNotificationPreferenceView, AdmissionNotificationEmailSettingsOperationResult } from "../../application/results/admission-notification-settings-result";
import { toAdmissionNotificationEmailSettingsView } from "../../application/results/admission-notification-settings-projection";
import { ADMISSION_NOTIFICATION_PREFERENCE_SOURCE } from "../../constants/admission-notification-preference";
import { ADMISSION_EMAIL_SETTINGS_STATUS } from "../../constants/admission-notification-email-settings";

/** @param preference - Own domain result, after current recipient authorization. @returns Only frequency, native version and its explicit/default origin. */
export function toAdmissionNotificationPreferenceView(preference: AdmissionNotificationPreference | AdmissionNotificationPreferenceSnapshot): AdmissionNotificationPreferenceView {
  return { mode: preference.mode, version: preference.version, source: "source" in preference ? preference.source : ADMISSION_NOTIFICATION_PREFERENCE_SOURCE.stored };
}
export { toAdmissionNotificationEmailSettingsView };
/** @param operation - Original owned ledger result, never a replacement GET. @returns Original UUID, progress and a deliberately selected terminal payload. */
export function toAdmissionNotificationEmailSettingsOperationView(operation: AdmissionOperationResult<AdmissionNotificationEmailSettingsChangePlan>): AdmissionNotificationEmailSettingsOperationResult {
  if (operation.state === OPERATION_STATE.started) return { state: operation.state, operationId: operation.operationId };
  const result = operation.result.status === ADMISSION_EMAIL_SETTINGS_STATUS.rejected
    ? { status: operation.result.status, reason: operation.result.reason }
    : { status: operation.result.status, settings: toAdmissionNotificationEmailSettingsView(operation.result.settings) };
  return { state: operation.state, operationId: operation.operationId, replayed: operation.replayed, result };
}
