/** Proposes system terminal decisions from current membership/product facts without granting access. @module admission-external-resolution */
import type { AdmissionRequest } from "../entities/admission-request";
import type { AdmissionDecision } from "../entities/admission-decision";
import type { AdmissionPolicy } from "../entities/admission-policy";
import type { AdmissionMembershipFacts } from "./admission-eligibility";
import { ADMISSION_REQUEST_STATUS } from "@/src/modules/academy-admissions/constants/admission-request";
import { ADMISSION_DECISION_ACTOR_KIND, ADMISSION_DECISION_RULE } from "@/src/modules/academy-admissions/constants/admission-decision";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { TRIBE_MEMBERSHIP_STATUS, TRIBE_MEMBERSHIP_STATUS_REASON } from "@/src/modules/tribes/constants/tribe-page-access";
import { snapshotAdmissionDecisionEvidence } from "../value-objects/admission-decision-evidence";

/** Private owner facts must be resolved after locks; absence alone never claims a membership was deleted. */
export type AdmissionExternalResolutionFacts = {
  tribeId: string; userId: string; academyAvailable: boolean; accountAvailable: boolean;
  membershipDeleted: boolean; membership: AdmissionMembershipFacts | null;
  policy: Pick<AdmissionPolicy, "tribeId" | "version" | "verificationEpoch"> | null;
};

/** A system resolution closes a request, preserves its provenance and creates no membership effect. */
export type AdmissionExternalResolutionProposal =
  | { allowed: false; code: "request_conflict" | "resource_unavailable" | "invalid_input" }
  | { allowed: true; changed: false; request: AdmissionRequest; decision: null }
  | { allowed: true; changed: true; request: AdmissionRequest; decision: AdmissionDecision };

/**
 * Resolves expiry before external cancellation and never rewrites a terminal request.
 * @param input - Exact original request/version, current owner facts and authoritative post-lock clock.
 * @returns A detached terminal proposal or unchanged request; its owner must commit decision, audit and notice together.
 * @remarks No invitation, proof, binding or membership is created, consumed, restored or erased here.
 */
export function proposeAdmissionExternalResolution(input: {
  request: AdmissionRequest; expectedVersion: number; decisionId: string;
  facts: AdmissionExternalResolutionFacts; now: Date;
}): AdmissionExternalResolutionProposal {
  const { request, facts, now } = input;
  if (request.status !== ADMISSION_REQUEST_STATUS.pending || request.version !== input.expectedVersion) return { allowed: false, code: ADMISSION_ERROR_CODE.requestConflict };
  if (facts.tribeId !== request.tribeId || facts.userId !== request.userId
    || facts.policy && facts.policy.tribeId !== request.tribeId
    || facts.membership && (facts.membership.tribeId !== request.tribeId || facts.membership.userId !== request.userId)) return { allowed: false, code: ADMISSION_ERROR_CODE.resourceUnavailable };
  if (!Number.isFinite(now.getTime()) || now < request.submittedAt) return { allowed: false, code: ADMISSION_ERROR_CODE.invalidInput };
  if (facts.membershipDeleted && facts.membership) return { allowed: false, code: ADMISSION_ERROR_CODE.invalidInput };
  const expired = now >= request.expiresAt;
  const membership = facts.membership;
  const legible = membership?.status === TRIBE_MEMBERSHIP_STATUS.active || membership?.status === TRIBE_MEMBERSHIP_STATUS.muted;
  const nonrecoverable = membership?.status === TRIBE_MEMBERSHIP_STATUS.blocked && membership.statusReason !== TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked
    || membership?.status === TRIBE_MEMBERSHIP_STATUS.removed && membership.statusReason !== TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive;
  const rule = expired ? ADMISSION_DECISION_RULE.expired
    : !facts.accountAvailable ? ADMISSION_DECISION_RULE.accountDeleted
      : !facts.academyAvailable ? ADMISSION_DECISION_RULE.academyUnavailable
        : facts.membershipDeleted ? ADMISSION_DECISION_RULE.membershipDeleted
          : nonrecoverable ? ADMISSION_DECISION_RULE.nonrecoverableMembership
            : legible ? ADMISSION_DECISION_RULE.externalResolution : null;
  if (!rule) return { allowed: true, changed: false, request, decision: null };
  const status = expired ? ADMISSION_REQUEST_STATUS.expired : ADMISSION_REQUEST_STATUS.cancelled;
  const decision: AdmissionDecision = {
    id: input.decisionId, requestId: request.id, tribeId: request.tribeId, userId: request.userId,
    requestVersion: request.version, outcome: status, actorUserId: null, actorKind: ADMISSION_DECISION_ACTOR_KIND.system,
    rule, policyVersion: facts.policy?.version ?? request.originalPolicy.version,
    verificationEpoch: facts.policy?.verificationEpoch ?? request.originalPolicy.verificationEpoch,
    internalReason: null, externalMessage: null, decidedAt: new Date(now), membershipEffectId: null, evidenceSnapshot: snapshotAdmissionDecisionEvidence(request.evidence),
  };
  return { allowed: true, changed: true, request: { ...request, status, version: request.version + 1, decisionId: decision.id, cancelReason: expired ? null : rule, resolvedAt: new Date(now) }, decision };
}
