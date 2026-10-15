/** Declares private independent email configuration under current native leadership. @module admission-notification-email-settings-repository */
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { AdmissionNotificationEmailSettings } from "../entities/admission-notification";
import type { AdmissionNotificationEmailSettingsChange, AdmissionNotificationEmailSettingsChangePlan } from "../entities/admission-notification-email-settings";

/** Binds explicit confirmation to its original durable operation and resource version. */
export type AdmissionNotificationEmailSettingsCommand = AdmissionNotificationEmailSettingsChange & { readonly operationId: string; readonly confirmed: true };
/** Keeps current queries separate from historical confirmed mutation results. */
export interface AdmissionNotificationEmailSettingsRepository {
  /** Reads settings without persisting defaults or loading provider credentials. */
  get(context: AuthorizedAdmissionContext): Promise<AdmissionNotificationEmailSettings>;
  /** Confirms one database-only transition or recovers its original result before considering another write. */
  change(context: AuthorizedAdmissionContext, command: AdmissionNotificationEmailSettingsCommand): Promise<AdmissionOperationResult<AdmissionNotificationEmailSettingsChangePlan>>;
}
