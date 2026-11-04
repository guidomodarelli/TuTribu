/** Names the unsupported original source behind an `admission_ineligible` approval. @module admission-approval-unsupported-error */
import type { AdmissionRequest } from "../entities/admission-request";

/** Closed reason of an approval refused because the writer does not support approving that original request. */
const ADMISSION_APPROVAL_UNSUPPORTED_ERROR_CODE = "approval_unsupported";

/**
 * Private cause of an `admission_ineligible` approval of a legacy request or of a personal one without its original binding:
 * the route boundary logs its code, so the 409 says approval is not supported for that request. It is never serialized to the browser,
 * whose inbox does not offer approval for those requests.
 */
export class AdmissionApprovalUnsupportedError extends Error {
  readonly code = ADMISSION_APPROVAL_UNSUPPORTED_ERROR_CODE;
  /** @param source - Persisted original source of the refused request. */
  constructor(public readonly source: AdmissionRequest["source"]) {
    super(`Admission approval unsupported for ${source} request: ${ADMISSION_APPROVAL_UNSUPPORTED_ERROR_CODE}`);
    this.name = "AdmissionApprovalUnsupportedError";
  }
}
