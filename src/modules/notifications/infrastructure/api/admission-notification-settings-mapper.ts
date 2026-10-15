/** Selects own safe notification settings DTO fields without carrying native identities or provider facts. @module admission-notification-settings-mapper */
import { OPERATION_STATE } from "@/src/constants/operation-state";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { AdmissionNotificationEmailSettingsChangePlan } from "../../domain/entities/admission-notification-email-settings";
import type { AdmissionNotificationEmailSettingsOperationResult } from "../../application/results/admission-notification-settings-result";
import { toAdmissionNotificationEmailSettingsView, toAdmissionNotificationPreferenceView } from "../../application/results/admission-notification-settings-projection";
import { ADMISSION_EMAIL_SETTINGS_STATUS } from "../../constants/admission-notification-email-settings";

export { toAdmissionNotificationEmailSettingsView, toAdmissionNotificationPreferenceView };
/** @param operation - Original owned ledger result, never a replacement GET. @returns Original UUID, progress and a deliberately selected terminal payload. */
export function toAdmissionNotificationEmailSettingsOperationView(operation: AdmissionOperationResult<AdmissionNotificationEmailSettingsChangePlan>): AdmissionNotificationEmailSettingsOperationResult {
  if (operation.state === OPERATION_STATE.started) return { state: operation.state, operationId: operation.operationId };
  const result = operation.result.status === ADMISSION_EMAIL_SETTINGS_STATUS.rejected
    ? { status: operation.result.status, reason: operation.result.reason }
    : { status: operation.result.status, settings: toAdmissionNotificationEmailSettingsView(operation.result.settings) };
  return { state: operation.state, operationId: operation.operationId, replayed: operation.replayed, result };
}
