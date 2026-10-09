/** Proposes current reviewer decisions without writing membership or external effects. @module admission-decision */
import type { AdmissionRequest } from "./admission-request";
import type { AdmissionActorFacts, PendingAdmissionReviewFacts } from "../policies/admission-eligibility";
import { canPerformAdmissionAction, evaluatePendingAdmissionReview } from "../policies/admission-eligibility";
import { ADMISSION_ACTION, ADMISSION_EVIDENCE_KIND } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_REQUEST_STATUS, ADMISSION_REQUEST_SOURCE } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_DECISION } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { ADMISSION_DECISION_ACTOR_KIND, ADMISSION_DECISION_RULE } from "@/src/modules/academy-admissions/constants/admission-decision";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { snapshotAdmissionDecisionEvidence, type AdmissionDecisionEvidence } from "../value-objects/admission-decision-evidence";

/** A terminal decision keeps internal reasoning separate from the applicant's safe external message. */
export type AdmissionDecision = {
  id: string; requestId: string; tribeId: string; userId: string; requestVersion: number;
  outcome: Exclude<AdmissionRequest["status"], "pending">; actorUserId: string | null; actorKind: "user" | "system";
  rule: string; policyVersion: number; verificationEpoch: number; internalReason: string | null; externalMessage: string | null;
  decidedAt: Date; membershipEffectId: string | null; evidenceSnapshot: AdmissionDecisionEvidence;
};

/**
 * Resolves reviewer permission/current eligibility before proposing a single terminal transition.
 * @param input - Locked original request, current own review facts, explicit version/reason and post-lock clock.
 * @returns A DB-only proposal with basic effect metadata, or denial without changing its inputs.
 * @remarks The writer must assign the effect id and commit decision, membership, audit and notice together.
 */
export function proposeAdmissionDecision(input: {
  request: AdmissionRequest; expectedVersion: number; decisionId: string; decision: "approve" | "reject";
  actor: AdmissionActorFacts; review: PendingAdmissionReviewFacts; internalReason: string; externalMessage: string | null; now: Date;
}) {
  const { request, actor, review } = input;
  const approved = input.decision === ADMISSION_DECISION.approve;
  const deny = (code: (typeof ADMISSION_ERROR_CODE)[keyof typeof ADMISSION_ERROR_CODE]) => ({ allowed: false as const, code });
  if (request.status !== ADMISSION_REQUEST_STATUS.pending || request.version !== input.expectedVersion) return deny(ADMISSION_ERROR_CODE.requestConflict);
  if (!canPerformAdmissionAction(actor, input.decision === ADMISSION_DECISION.approve ? ADMISSION_ACTION.decideRequest : ADMISSION_ACTION.rejectRequest, { tribeId: request.tribeId, applicantUserId: request.userId })) return deny(ADMISSION_ERROR_CODE.permissionDenied);
  const reason = input.internalReason.trim(), external = input.externalMessage?.trim() || null;
  if (!reason || reason.length > ADMISSION_LIMIT.internalMessageCharacters || external && external.length > ADMISSION_LIMIT.externalMessageCharacters) return deny(ADMISSION_ERROR_CODE.invalidInput);
  if (!Number.isFinite(input.now.getTime()) || input.now >= request.expiresAt || input.now < request.submittedAt) return deny(ADMISSION_ERROR_CODE.admissionIneligible);
  const contactMatches = request.contact === null ? review.contact === null
    : review.contact !== null && request.contact.type === review.contact.type && request.contact.value === review.contact.value;
  const sourceMatches = (request.source === review.request.source.kind || request.source === ADMISSION_REQUEST_SOURCE.legacy && review.request.source.kind === ADMISSION_REQUEST_SOURCE.common)
    && (review.request.source.kind !== ADMISSION_REQUEST_SOURCE.personal || review.request.source.invitation.requiresAllowlist === request.requiresAllowlist);
  const proofMatches = (request.proofId ?? null) === (review.request.attachedEvidence?.id ?? null)
    && (request.evidence.kind !== ADMISSION_EVIDENCE_KIND.local || request.evidence.proofId === request.proofId);
  if (review.tribe.id !== request.tribeId || review.request.id !== request.id || review.request.userId !== request.userId || review.request.expiresAt.getTime() !== request.expiresAt.getTime() || approved && (!contactMatches || !sourceMatches || !proofMatches)) return deny(ADMISSION_ERROR_CODE.resourceUnavailable);
  if (approved && request.source === ADMISSION_REQUEST_SOURCE.personal && !request.bindingId) return deny(ADMISSION_ERROR_CODE.admissionIneligible);
  if (input.decision === ADMISSION_DECISION.approve && !evaluatePendingAdmissionReview({ ...review, reviewer: actor, now: input.now, exceptionReason: reason }).eligible) return deny(ADMISSION_ERROR_CODE.admissionIneligible);
  const status = approved ? ADMISSION_REQUEST_STATUS.approved : ADMISSION_REQUEST_STATUS.rejected;
  const decision: AdmissionDecision = {
    id: input.decisionId, requestId: request.id, tribeId: request.tribeId, userId: request.userId, requestVersion: request.version,
    outcome: status, actorUserId: actor.userId, actorKind: ADMISSION_DECISION_ACTOR_KIND.user, rule: ADMISSION_DECISION_RULE.manualReview,
    policyVersion: review.policy?.version ?? request.originalPolicy.version, verificationEpoch: review.policy?.verificationEpoch ?? request.originalPolicy.verificationEpoch,
    internalReason: reason, externalMessage: external, decidedAt: new Date(input.now), membershipEffectId: null, evidenceSnapshot: snapshotAdmissionDecisionEvidence(request.evidence),
  };
  return {
    allowed: true as const, request: { ...request, status, version: request.version + 1, decisionId: decision.id, resolvedAt: new Date(input.now) }, decision,
    membershipEffect: approved ? { role: TRIBE_MEMBER_ROLE.tribemate, status: review.membership?.commercialRecoveryStatus ?? TRIBE_MEMBERSHIP_STATUS.active } : null,
  };
}
