/** Builds safe in-app admission links without granting access or reading a session. @module admission-routes */
import { ADMISSION_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-navigation";

/** @param slug - Boundary-normalized academy slug. @returns Its public request entry without performing admission or granting membership. */
export function buildAdmissionEntryRoute(slug: string): string {
  return `${ADMISSION_NAVIGATION.publicPrefix}/${encodeURIComponent(slug)}`;
}

/** @param slug - Public boundary-normalized tribe slug. @param requestId - Own public request UUID. @returns The applicant's request route with its explicit tribe lookup. */
export function buildOwnAdmissionRequestRoute(slug: string, requestId: string): string {
  const query = new URLSearchParams({ [ADMISSION_NAVIGATION.tribeQuery]: slug });
  return `${ADMISSION_NAVIGATION.publicPrefix}/${ADMISSION_NAVIGATION.requestSegment}/${encodeURIComponent(requestId)}?${query}`;
}

/** @param slug - Public boundary-normalized tribe slug. @param requestId - Scoped reviewer request UUID. @returns The reviewer inbox link; the destination rechecks current role. */
export function buildAdmissionReviewRoute(slug: string, requestId: string): string {
  const query = new URLSearchParams({ [ADMISSION_NAVIGATION.requestQuery]: requestId });
  return `/${encodeURIComponent(slug)}/${ADMISSION_NAVIGATION.reviewSegment}?${query}`;
}
