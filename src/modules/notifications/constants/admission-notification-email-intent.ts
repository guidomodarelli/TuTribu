/** Owns complete grouped-email intent identity independently of legacy recovery payloads. @module admission-notification-email-intent-constants */
import type { AdmissionNotificationPreparationStatus } from "../domain/repositories/admission-notification-group-preparation";

/** Versions the complete internal group intent, not the existing reference manifest or legacy recovery tuple. */
export const ADMISSION_NOTIFICATION_EMAIL_INTENT_FORMAT = 1;
/** Distinguishes grouped notification content from code delivery and individual legacy recovery. */
export const ADMISSION_NOTIFICATION_EMAIL_INTENT_KIND = "admission_notification_group";
/** Separates this full-content HMAC from every existing payload and key use. */
export const ADMISSION_NOTIFICATION_EMAIL_INTENT_MAC_DOMAIN = "tutribu.admission.notification.group-intent.v1";
/** Reports one original durable outbox without claiming provider acceptance. */
export const ADMISSION_NOTIFICATION_PREPARATION_QUEUED = "queued";
/** Defers an open bucket until its original calendar boundary. */
export const ADMISSION_NOTIFICATION_PREPARATION_NOT_DUE = "not_due";
/** Retains open work when its selected resource cannot currently prepare email. */
export const ADMISSION_NOTIFICATION_PREPARATION_UNAVAILABLE = "unavailable";
/** Closes optional email while leaving its original internal notice intact. */
export const ADMISSION_NOTIFICATION_PREPARATION_SUPPRESSED = "suppressed";
/** Closes a bucket whose original notification deadlines have elapsed. */
export const ADMISSION_NOTIFICATION_PREPARATION_EXPIRED = "expired";
/** Owns preparation outcomes independently of a provider's delivery status. */
export const ADMISSION_NOTIFICATION_PREPARATION_STATUS = { queued: ADMISSION_NOTIFICATION_PREPARATION_QUEUED, notDue: ADMISSION_NOTIFICATION_PREPARATION_NOT_DUE, unavailable: ADMISSION_NOTIFICATION_PREPARATION_UNAVAILABLE, suppressed: ADMISSION_NOTIFICATION_PREPARATION_SUPPRESSED, expired: ADMISSION_NOTIFICATION_PREPARATION_EXPIRED } as const satisfies Record<string, AdmissionNotificationPreparationStatus>;
