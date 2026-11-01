/** Declares private independent email configuration under current native leadership. @module admission-notification-email-settings-repository */
import type { AuthorizedAdmissionContext } from "@/src/modules/academy-admissions/domain/repositories/admission-authorization-reader";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import type { AdmissionNotificationEmailSettings } from "../entities/admission-notification";
import type { AdmissionNotificationEmailSettingsChange, AdmissionNotificationEmailSettingsChangePlan } from "../entities/admission-notification-email-settings";

/** Binds explicit confirmation to its original durable operation and resource version. */
export type AdmissionNotificationEmailSettingsCommand = AdmissionNotificationEmailSettingsChange & { readonly operationId: string; readonly confirmed: true };
/** Current settings and, read in the same authorized transaction, why the platform cannot protect a change to them right now (null when it can). */
export type AdmissionNotificationEmailSettingsCurrent = { readonly settings: AdmissionNotificationEmailSettings; readonly platformRequirement: PlatformSecurityRequirement | null };
/** Keeps current queries separate from historical confirmed mutation results. */
export interface AdmissionNotificationEmailSettingsRepository {
  /** Reads settings and the platform requirement without persisting defaults or loading provider credentials. */
  get(context: AuthorizedAdmissionContext): Promise<AdmissionNotificationEmailSettingsCurrent>;
  /** Confirms one database-only transition or recovers its original result before considering another write. */
  change(context: AuthorizedAdmissionContext, command: AdmissionNotificationEmailSettingsCommand): Promise<AdmissionOperationResult<AdmissionNotificationEmailSettingsChangePlan>>;
}
