/** Builds the in-app address an admission email links to, without granting access. @module admission-notification-path */
import { ADMISSION_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-navigation";
import { buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";
import { ADMISSION_NOTIFICATION_AUDIENCE } from "../../constants/admission-notifications";
import type { AdmissionNotificationAudience } from "../../domain/entities/admission-notification";

/**
 * @param audience - Who the group notifies. @param tribeSlug - Current tribe slug. @param admissionRequestId - First request of the frozen manifest.
 * @returns The reviewer queue path, or the applicant's own request path with its tribe, which that page needs to open it.
 */
export function admissionNotificationPath(audience: AdmissionNotificationAudience, tribeSlug: string, admissionRequestId: string): string {
  if (audience === ADMISSION_NOTIFICATION_AUDIENCE.reviewer) return `/${encodeURIComponent(tribeSlug)}/${ADMISSION_NAVIGATION.reviewSegment}`;
  return buildOwnAdmissionRequestRoute(tribeSlug, admissionRequestId);
}
