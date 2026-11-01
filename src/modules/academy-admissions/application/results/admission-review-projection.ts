/** Projects only reviewer-owned display facts and current decision eligibility. @module admission-review-projection */
import type { AdmissionReviewRecord } from "@/src/modules/academy-admissions/domain/repositories/admission-review-reader";
import { evaluatePendingAdmissionReview, canPerformAdmissionAction, needsPendingAdmissionVerification } from "@/src/modules/academy-admissions/domain/policies/admission-eligibility";
import { getAdmissionRetryAllowedAt } from "@/src/modules/academy-admissions/domain/entities/admission-request";
import { admissionReviewSchema } from "./admission-flow-result-schemas";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_ACTION, ADMISSION_DENIAL_REASON, ADMISSION_EVIDENCE_KIND, ADMISSION_SOURCE_KIND, ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_DECISION, ADMISSION_REVIEW_ACCOUNT_SCOPE, ADMISSION_REVIEW_EVIDENCE_SOURCE } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { isSameAdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import { ADMISSION_CONTACT_MASK, ADMISSION_PHONE_VISIBLE_SUFFIX_LENGTH } from "@/src/modules/academy-admissions/constants/admission-contact-presentation";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";

/**
 * @param record - Private scoped request and current evaluation facts.
 * @param platformRequirement - Requirement read with the record that keeps the platform from protecting a decision; while present no
 * decision is offered, because the decision writer would reject every one. Null (the default for display-only reads) when decisions can be protected.
 * @returns An allowlisted reviewer DTO, never a permission token or provider record.
 */
export function projectAdmissionReview(record: AdmissionReviewRecord, platformRequirement: PlatformSecurityRequirement | null = null) {
  const { request, review } = record;
  const pending = request.status === ADMISSION_REQUEST_STATUS.pending;
  const expired = pending && review.now >= request.expiresAt;
  const evaluation = pending ? evaluatePendingAdmissionReview(review) : null;
  const reviewerAllowed = canPerformAdmissionAction(review.reviewer, ADMISSION_ACTION.rejectRequest, { tribeId: request.tribeId, applicantUserId: request.userId });
  const eligibleActions = pending && !expired && reviewerAllowed && platformRequirement === null ? reviewDecisions(evaluation, record.approvalSupported) : [];
  const contact = request.contact;
  const maskedValue = maskReviewContact(contact);
  const evidence = projectReviewEvidence(request);
  const invitation = review.request.source.kind === ADMISSION_SOURCE_KIND.personal ? review.request.source.invitation : null;
  const retryAt = !pending && request.status !== ADMISSION_REQUEST_STATUS.approved ? getAdmissionRetryAllowedAt(request) : null;
  return admissionReviewSchema.parse({
    id: request.id, status: request.status, version: request.version, submittedAt: request.submittedAt.toISOString(), expiresAt: request.expiresAt.toISOString(), source: request.source,
    ...(contact && maskedValue ? { contact: { type: contact.type, maskedValue, evidenceKind: request.evidence.kind }, rawContact: contact.value } : {}),
    needsVerification: pending && !expired && needsPendingAdmissionVerification(review),
    pendingAgeThresholdReached: pending && !expired && review.now.getTime() - request.submittedAt.getTime() >= ADMISSION_LIMIT.pendingReminderDelayMs,
    eligibilityReasons: reviewEligibilityReasons(expired, evaluation),
    ...optionalReviewTexts(record, retryAt),
    applicant: { id: request.userId, name: record.applicantName }, evidence, eligibleActions,
    whatsappNumber: request.whatsappNumber ?? null, requiresWhatsappNumber: review.policy?.requiresWhatsappNumber ?? false,
    restrictions: { requiresAllowlist: request.requiresAllowlist, requiresExceptionReason: evaluation?.reason === ADMISSION_DENIAL_REASON.exceptionReasonRequired,
      invitation: invitation ? projectReviewInvitation(invitation, contact) : null },
  });
}

type ReviewedAdmissionRequest = AdmissionReviewRecord["request"];

/** @param contact - Raw applicant contact, when present. @returns The phone suffix or the email's first character and domain behind a mask. */
function maskReviewContact(contact: ReviewedAdmissionRequest["contact"]): string | null {
  if (!contact) return null;
  if (contact.type === ADMISSION_CONTACT_TYPE.phone) return `${ADMISSION_CONTACT_MASK}${contact.value.slice(-ADMISSION_PHONE_VISIBLE_SUFFIX_LENGTH)}`;
  return `${Array.from(contact.value)[0] ?? ""}${ADMISSION_CONTACT_MASK}@${contact.value.split("@").at(-1) ?? ""}`;
}

/** @param request - Scoped request with its evidence. @returns Base or local evidence with its public scope, or only the evidence kind. */
function projectReviewEvidence(request: ReviewedAdmissionRequest) {
  if (request.evidence.kind === ADMISSION_EVIDENCE_KIND.base) return { kind: request.evidence.kind, source: ADMISSION_REVIEW_EVIDENCE_SOURCE.google, scope: ADMISSION_REVIEW_ACCOUNT_SCOPE, verifiedAt: request.evidence.verifiedAt.toISOString() };
  if (request.evidence.kind === ADMISSION_EVIDENCE_KIND.local) return { kind: request.evidence.kind, source: ADMISSION_REVIEW_EVIDENCE_SOURCE.localCode, scope: { tribeId: request.tribeId, requestId: request.id, purpose: ADMISSION_VERIFICATION_PURPOSE.admission }, verifiedAt: request.evidence.verifiedAt.toISOString() };
  return { kind: request.evidence.kind };
}

/** @param expired - Whether the pending request already expired. @param evaluation - Current pending evaluation, if any. @returns The single reason the reviewer must see, or none. */
function reviewEligibilityReasons(expired: boolean, evaluation: ReturnType<typeof evaluatePendingAdmissionReview> | null) {
  if (expired) return [ADMISSION_DENIAL_REASON.requestExpired];
  return evaluation?.reason ? [evaluation.reason] : [];
}

/** @param record - Scoped review record. @param retryAt - Next allowed presentation, if any. @returns Only the present optional texts and retry instant. */
function optionalReviewTexts(record: AdmissionReviewRecord, retryAt: Date | null) {
  return {
    ...(record.externalMessage ? { externalMessage: record.externalMessage } : {}), ...(record.internalReason ? { internalReason: record.internalReason } : {}),
    ...(record.request.applicantMessage ? { applicantMessage: record.request.applicantMessage } : {}), ...(retryAt ? { retryAllowedAt: retryAt.toISOString() } : {}),
  };
}

/** @param invitation - Personal invitation behind the request. @param contact - Request contact, if any. @returns The reviewer's invitation restriction view. */
function projectReviewInvitation(invitation: ReviewInvitation, contact: AdmissionReviewRecord["request"]["contact"]) {
  return { status: invitation.status, requiresAllowlist: invitation.requiresAllowlist, authorizationRevoked: invitation.authorizationRevoked, recipientMatches: isSameAdmissionContact(invitation.contact, contact ?? null), expiresAt: invitation.expiresAt?.toISOString() ?? null };
}

/** Personal invitation facts carried by a personal review source. */
type ReviewInvitation = Extract<AdmissionReviewRecord["review"]["request"]["source"], { kind: typeof ADMISSION_SOURCE_KIND.personal }>["invitation"];

/** @param evaluation - Current pending evaluation, if any. @param approvalSupported - Whether this writer can approve. @returns Rejection, plus approval when the request is eligible or only needs an exception reason; the caller offers none while the platform cannot protect a decision. */
function reviewDecisions(evaluation: ReturnType<typeof evaluatePendingAdmissionReview> | null, approvalSupported: boolean) {
  const canPrepareApproval = evaluation !== null && (evaluation.eligible || evaluation.reason === ADMISSION_DENIAL_REASON.exceptionReasonRequired);
  return [ADMISSION_DECISION.reject, ...(canPrepareApproval && approvalSupported ? [ADMISSION_DECISION.approve] : [])];
}
