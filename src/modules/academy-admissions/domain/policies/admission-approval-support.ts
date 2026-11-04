/** Owns which original requests the manual decision writer can approve, shared by the reviewer inbox and the writer. @module admission-approval-support */
import type { AdmissionRequest } from "../entities/admission-request";
import type { AdmissionPolicy } from "../entities/admission-policy";
import type { AdmissionSourceFacts } from "./admission-eligibility";
import { ADMISSION_REQUEST_SOURCE } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_POLICY_MODE } from "@/src/modules/academy-admissions/constants/admission-policy";

/**
 * @param request - Persisted original source and bound personal authorization.
 * @returns Whether the stored request itself can be approved: a common request, or a personal one already bound to its redeemed invitation.
 * @remarks Legacy arrivals stay closed for approval and can only be rejected or cancelled.
 */
export function isAdmissionRequestApprovable(request: Pick<AdmissionRequest, "source" | "bindingId">): boolean {
  if (request.source === ADMISSION_REQUEST_SOURCE.common) return true;
  return request.source === ADMISSION_REQUEST_SOURCE.personal && request.bindingId !== null;
}

/**
 * @param input - Persisted original `request`, its current readable `source` and the current `policy`, if any.
 * @returns Whether the implemented manual writer can approve it: an approvable stored request whose personal invitation is still readable, under a manual or list policy.
 * @remarks Support does not replace current eligibility; the writer still evaluates every current requirement.
 */
export function isAdmissionApprovalSupported(input: { request: Pick<AdmissionRequest, "source" | "bindingId">; source: Pick<AdmissionSourceFacts, "kind">; policy: Pick<AdmissionPolicy, "mode"> | null }): boolean {
  const sourceReadable = input.request.source !== ADMISSION_REQUEST_SOURCE.personal || input.source.kind === ADMISSION_REQUEST_SOURCE.personal;
  const policySupported = input.policy?.mode === ADMISSION_POLICY_MODE.manualReview || input.policy?.mode === ADMISSION_POLICY_MODE.allowlist;
  return isAdmissionRequestApprovable(input.request) && sourceReadable && policySupported;
}
