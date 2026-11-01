/** Defines same-origin settings interaction ports without provider SDK, session or transport details. @module admission-notification-settings-browser-client */
import type { AdmissionBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-browser-client";
import type { AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { AdmissionNotificationPreferenceChange } from "../../domain/entities/admission-notification-preference";
import type { AdmissionNotificationEmailSettingsCommand } from "../../domain/repositories/admission-notification-email-settings-repository";
import type { AdmissionNotificationPreferenceReadResult, AdmissionNotificationPreferenceChangeResult, AdmissionNotificationEmailSettingsReadResult, AdmissionNotificationEmailSettingsOperationResult } from "../results/admission-notification-settings-result";

/** Every private response carries its actual native viewer; the browser never supplies that authority. */
export type AdmissionNotificationSettingsBoundResult<Value> = { viewerId: string; data: Value };
/** Known business rejections remain in their result union; transport uncertainty never claims a save. */
export type AdmissionNotificationSettingsBrowserResult<Value> = { status: "ready"; value: Value } | { status: "failed"; code: AdmissionErrorCode; message: string; uncertain: boolean } | { status: "aborted" };
/** All writes require an explicit action; cancellation does not assert rollback of an already sent command. */
export interface AdmissionNotificationSettingsBrowserClient {
  viewer: AdmissionBrowserClient["viewer"];
  readPreference(slug: string, signal: AbortSignal): Promise<AdmissionNotificationSettingsBrowserResult<AdmissionNotificationSettingsBoundResult<AdmissionNotificationPreferenceReadResult>>>;
  changePreference(slug: string, input: AdmissionNotificationPreferenceChange, signal: AbortSignal): Promise<AdmissionNotificationSettingsBrowserResult<AdmissionNotificationSettingsBoundResult<AdmissionNotificationPreferenceChangeResult>>>;
  readEmail(slug: string, signal: AbortSignal): Promise<AdmissionNotificationSettingsBrowserResult<AdmissionNotificationSettingsBoundResult<AdmissionNotificationEmailSettingsReadResult>>>;
  changeEmail(slug: string, input: AdmissionNotificationEmailSettingsCommand, signal: AbortSignal): Promise<AdmissionNotificationSettingsBrowserResult<AdmissionNotificationSettingsBoundResult<AdmissionNotificationEmailSettingsOperationResult>>>;
  operation(slug: string, operationId: string, signal: AbortSignal): Promise<AdmissionNotificationSettingsBrowserResult<AdmissionNotificationSettingsBoundResult<AdmissionNotificationEmailSettingsOperationResult>>>;
}
