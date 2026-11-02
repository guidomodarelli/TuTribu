/** Maps the closed failures of an admission page read to read copy instead of the write and applicant catalogue. @module admission-read-errors */
import { PAGE_READ_COPY } from "@/src/constants/page-read";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE, type AdmissionErrorCode } from "./admission-errors";

/** Read copy of the failures a page read can end with; any other code keeps its catalogue copy. */
const ADMISSION_READ_ERROR_MESSAGE = {
  [ADMISSION_ERROR_CODE.invalidInput]: PAGE_READ_COPY.invalidAddress,
  [ADMISSION_ERROR_CODE.authenticationRequired]: PAGE_READ_COPY.signInRequired,
  [ADMISSION_ERROR_CODE.permissionDenied]: PAGE_READ_COPY.permissionDenied,
  [ADMISSION_ERROR_CODE.resourceUnavailable]: PAGE_READ_COPY.notFound,
  [ADMISSION_ERROR_CODE.policyConflict]: PAGE_READ_COPY.changedWhileReading,
  [ADMISSION_ERROR_CODE.requestConflict]: PAGE_READ_COPY.changedWhileReading,
  [ADMISSION_ERROR_CODE.dependencyUnavailable]: PAGE_READ_COPY.unavailable,
  [ADMISSION_ERROR_CODE.transportTimeout]: PAGE_READ_COPY.unavailable,
  [ADMISSION_ERROR_CODE.upstreamPayloadUnusable]: PAGE_READ_COPY.unavailable,
  [ADMISSION_ERROR_CODE.publicContractUnusable]: PAGE_READ_COPY.unavailable,
  [ADMISSION_ERROR_CODE.unexpectedFailure]: PAGE_READ_COPY.unavailable,
} as const satisfies Partial<Record<AdmissionErrorCode, string>>;

/**
 * @param code - Closed failure of the page read.
 * @returns Its read copy, or the catalogue copy for a code with no read-specific meaning (for example a platform block).
 */
export function admissionReadErrorMessage(code: AdmissionErrorCode): string {
  return (ADMISSION_READ_ERROR_MESSAGE as Partial<Record<AdmissionErrorCode, string>>)[code] ?? ADMISSION_ERROR_MESSAGE[code];
}
