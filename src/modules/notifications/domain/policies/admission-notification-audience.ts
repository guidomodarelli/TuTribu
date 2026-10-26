/** Selects the canonical internal audience shared by materialization and optional-email planning. @module admission-notification-audience */
import { ADMISSION_NOTIFICATION_AUDIENCE } from "../../constants/admission-notifications";
import { ADMISSION_NOTIFICATION_EVENT } from "../../constants/admission-notification-groups";
import type { AdmissionNotificationAudience, AdmissionNotificationEvent } from "../entities/admission-notification";

/**
 * Routes pending work to reviewers and request resolutions to the applicant.
 * @param event - Original notification event, including its time-driven reminder.
 * @returns The owning audience; current recipient authority must still be checked by the caller.
 */
export function resolveAdmissionNotificationAudience(event: AdmissionNotificationEvent): AdmissionNotificationAudience {
  return event === ADMISSION_NOTIFICATION_EVENT.pendingCreated || event === ADMISSION_NOTIFICATION_EVENT.reminder
    ? ADMISSION_NOTIFICATION_AUDIENCE.reviewer
    : ADMISSION_NOTIFICATION_AUDIENCE.applicant;
}
