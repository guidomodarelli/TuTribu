/** Projects only reviewer-owned display facts and current decision eligibility. @module admission-review-projection */
import type { AdmissionReviewRecord } from "@/src/modules/academy-admissions/domain/repositories/admission-review-reader";
import { evaluatePendingAdmissionReview, canPerformAdmissionAction } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { getAdmissionRetryAllowedAt } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import { admissionReviewSchema } from "./admission-flow-result-schemas";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_ACTION, ADMISSION_DENIAL_REASON, ADMISSION_EVIDENCE_KIND, ADMISSION_SOURCE_KIND, ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_DECISION, ADMISSION_REVIEW_ACCOUNT_SCOPE, ADMISSION_REVIEW_EVIDENCE_SOURCE } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_CONTACT_MASK, ADMISSION_PHONE_VISIBLE_SUFFIX_LENGTH } from "@/src/modules/academy-admissions/constants/admission-contact-presentation";

/** @param record - Private scoped request and current evaluation facts. @returns An allowlisted reviewer DTO, never a permission token or provider record. */
export function projectAdmissionReview(record: AdmissionReviewRecord) {
  const { request, review } = record;
  const pending = request.status === ADMISSION_REQUEST_STATUS.pending;
  const expired = pending && review.now >= request.expiresAt;
  const evaluation = pending ? evaluatePendingAdmissionReview(review) : null;
  const reviewerAllowed = canPerformAdmissionAction(review.reviewer, ADMISSION_ACTION.rejectRequest, { tribeId: request.tribeId, applicantUserId: request.userId });
  const eligibleActions = pending && !expired && reviewerAllowed ? [ADMISSION_DECISION.reject, ...(evaluation?.eligible && record.approvalSupported ? [ADMISSION_DECISION.approve] : [])] : [];
  const contact = request.contact;
  const maskedValue = contact?.type === ADMISSION_CONTACT_TYPE.phone ? `${ADMISSION_CONTACT_MASK}${contact.value.slice(-ADMISSION_PHONE_VISIBLE_SUFFIX_LENGTH)}` : contact ? `${Array.from(contact.value)[0] ?? ""}${ADMISSION_CONTACT_MASK}@${contact.value.split("@").at(-1) ?? ""}` : null;
  const evidence = request.evidence.kind === ADMISSION_EVIDENCE_KIND.base ? { kind: request.evidence.kind, source: ADMISSION_REVIEW_EVIDENCE_SOURCE.google, scope: ADMISSION_REVIEW_ACCOUNT_SCOPE, verifiedAt: request.evidence.verifiedAt.toISOString() }
    : request.evidence.kind === ADMISSION_EVIDENCE_KIND.local ? { kind: request.evidence.kind, source: ADMISSION_REVIEW_EVIDENCE_SOURCE.localCode, scope: { tribeId: request.tribeId, requestId: request.id, purpose: ADMISSION_VERIFICATION_PURPOSE.admission }, verifiedAt: request.evidence.verifiedAt.toISOString() } : { kind: request.evidence.kind };
  const invitation = review.request.source.kind === ADMISSION_SOURCE_KIND.personal ? review.request.source.invitation : null;
  const retryAt = !pending && request.status !== ADMISSION_REQUEST_STATUS.approved ? getAdmissionRetryAllowedAt(request) : null;
  return admissionReviewSchema.parse({
    id: request.id, status: request.status, version: request.version, submittedAt: request.submittedAt.toISOString(), expiresAt: request.expiresAt.toISOString(), source: request.source,
    ...(contact && maskedValue ? { contact: { type: contact.type, maskedValue, evidenceKind: request.evidence.kind }, rawContact: contact.value } : {}),
    needsVerification: pending && !expired && evaluation?.reason === ADMISSION_DENIAL_REASON.proofRequired,
    eligibilityReasons: expired ? [ADMISSION_DENIAL_REASON.requestExpired] : evaluation?.reason ? [evaluation.reason] : [],
    ...(record.externalMessage ? { externalMessage: record.externalMessage } : {}), ...(record.internalReason ? { internalReason: record.internalReason } : {}),
    ...(request.applicantMessage ? { applicantMessage: request.applicantMessage } : {}), ...(retryAt ? { retryAllowedAt: retryAt.toISOString() } : {}),
    applicant: { id: request.userId, name: record.applicantName }, evidence, eligibleActions,
    restrictions: { requiresAllowlist: request.requiresAllowlist, requiresExceptionReason: evaluation?.reason === ADMISSION_DENIAL_REASON.exceptionReasonRequired,
      invitation: invitation ? { status: invitation.status, requiresAllowlist: invitation.requiresAllowlist, authorizationRevoked: invitation.authorizationRevoked, recipientMatches: invitation.contact.type === contact?.type && invitation.contact.value === contact?.value, expiresAt: invitation.expiresAt?.toISOString() ?? null } : null },
  });
}
