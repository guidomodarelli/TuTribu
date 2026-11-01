/** Classifies a definitive applicant write refusal for the browser workflows. @module admission-applicant-refusal */
import type { AdmissionErrorCode } from "../../constants/admission-errors";
import { ADMISSION_APPLICANT_REFUSAL_COPY, ADMISSION_STATE_CHANGED_WRITE_CODES } from "../../constants/admission-ui";

/** @param code - Closed code of a definitive refusal. @returns Whether it means the state behind the page changed, so the page must read it again before another confirmation. */
export function isAdmissionStateChangedRefusal(code: AdmissionErrorCode): boolean {
  return ADMISSION_STATE_CHANGED_WRITE_CODES.includes(code);
}

/** @param code - Closed code of a definitive refusal. @param message - Its safe catalogue copy. @returns The copy the applicant reads next to the control. */
export function applicantRefusalMessage(code: AdmissionErrorCode, message: string): string {
  return ADMISSION_APPLICANT_REFUSAL_COPY[code] ?? message;
}
