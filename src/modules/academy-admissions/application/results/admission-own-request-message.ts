/** Projects safe current restriction copy for both own status and admission overview. @module admission-own-request-message */
import type { AdmissionRequestDto } from "./admission-flow-result-schemas";
import { ADMISSION_DENIAL_REASON } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_REQUEST_ELIGIBILITY_COPY, ADMISSION_REQUEST_REVERIFICATION_COPY } from "@/src/modules/academy-admissions/constants/request-status-presentation";

/**
 * Selects an actionable current reason without changing the stored state or requiring a new request.
 * @param request - Allowlisted current own snapshot, never internal review notes.
 * @returns Safe Spanish feedback or null when no applicant restriction needs explanation.
 */
export function getOwnAdmissionRequestMessage(request: Pick<AdmissionRequestDto, "needsVerification" | "eligibilityReasons">): string | null {
  for (const reason of request.eligibilityReasons) {
    if (reason === ADMISSION_DENIAL_REASON.evidenceRevoked) return ADMISSION_REQUEST_REVERIFICATION_COPY.revoked;
    if (reason === ADMISSION_DENIAL_REASON.proofRequired) return ADMISSION_REQUEST_REVERIFICATION_COPY.required;
    const message = ADMISSION_REQUEST_ELIGIBILITY_COPY[reason];
    if (message) return message;
  }
  return request.needsVerification ? ADMISSION_REQUEST_REVERIFICATION_COPY.required : null;
}
