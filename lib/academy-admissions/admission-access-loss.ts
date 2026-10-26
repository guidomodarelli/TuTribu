/** Tells a lost account or tribe authority apart from a failure the leader can retry on the same page. @module admission-access-loss */
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** @param code - Safe own failure code of a private read. @returns Whether the leader lost the session or the authority behind the page, so its private data must be hidden. */
export function isAdmissionAccessLoss(code: string): boolean {
  return code === ADMISSION_ERROR_CODE.permissionDenied || code === ADMISSION_ERROR_CODE.authenticationRequired;
}
