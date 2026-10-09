/** Proposes system approval from current trusted allowlist facts without writing access. @module automatic-admission-decision */
import type { AdmissionRequest } from "./admission-request";
import type { AdmissionDecision } from "./admission-decision";
import type { AdmissionSubmissionFacts } from "../policies/admission-eligibility";
import { ADMISSION_ERROR_CODE, type AdmissionErrorCode } from "../../constants/admission-errors";
import { ADMISSION_EVIDENCE_KIND, ADMISSION_OUTCOME } from "../../constants/admission-eligibility";
import { ADMISSION_REQUEST_STATUS } from "../../constants/admission-request";
import { ADMISSION_DECISION_ACTOR_KIND, ADMISSION_DECISION_RULE } from "../../constants/admission-decision";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { evaluateAdmissionSubmission } from "../policies/admission-eligibility";
import { snapshotAdmissionDecisionEvidence } from "../value-objects/admission-decision-evidence";

/** The consumed list reference remains private and versioned independently of contact binding. */
export type AutomaticAdmissionFacts = Omit<AdmissionSubmissionFacts, "allowlistEntry" | "baseEvidence"> & {
  allowlistEntry: (NonNullable<AdmissionSubmissionFacts["allowlistEntry"]> & { id: string; version: number }) | null;
  baseEvidence: (NonNullable<AdmissionSubmissionFacts["baseEvidence"]> & { id: string; verifiedAt: Date }) | null;
};
/** Private system proposal retains exact list authorization and its basic membership effect. */
export type AutomaticAdmissionProposal = { allowed: false; code: AdmissionErrorCode } | { allowed: true; request: AdmissionRequest; decision: AdmissionDecision; authorization: { entryId: string; version: number }; membershipEffect: { role: "tribemate"; status: "active" | "muted" } };
/** @param input - Current locked facts, exact owned request/proof and server-selected decision/clock. @returns A system proposal only for genuine admission, never pending or an inferred permission. */
export function proposeAutomaticAdmissionDecision(input: { facts: AutomaticAdmissionFacts; request: AdmissionRequest; decisionId: string; now: Date }): AutomaticAdmissionProposal {
  const { request, facts, now } = input, policy = facts.policy, entry = facts.allowlistEntry;
  const deny = (code: AdmissionErrorCode): AutomaticAdmissionProposal => ({ allowed: false, code });
  if (request.status !== ADMISSION_REQUEST_STATUS.pending || !Number.isInteger(request.version) || request.version <= 0 || !Number.isFinite(now.getTime()) || now < request.submittedAt || now >= request.expiresAt) return deny(ADMISSION_ERROR_CODE.requestConflict);
  if (!facts.account || !policy || !entry || !entry.id || !Number.isInteger(entry.version) || entry.version <= 0
    || request.tribeId !== facts.tribe.id || request.userId !== facts.account.userId || request.originalPolicy.version !== policy.version
    || request.originalPolicy.verificationEpoch !== policy.verificationEpoch || !request.bindingId
    || !request.contact || !facts.contact || request.contact.type !== facts.contact.type || request.contact.value !== facts.contact.value
    || request.source !== facts.source.kind) return deny(ADMISSION_ERROR_CODE.resourceUnavailable);
  const outcome = evaluateAdmissionSubmission({ ...facts, now });
  if (outcome.outcome !== ADMISSION_OUTCOME.admitted || !outcome.bindContact || outcome.evidenceKind !== request.evidence.kind) return deny(ADMISSION_ERROR_CODE.admissionIneligible);
  if (request.evidence.kind === ADMISSION_EVIDENCE_KIND.base && (!facts.baseEvidence || request.evidence.identityEvidenceId !== facts.baseEvidence.id || request.evidence.verifiedAt.getTime() !== facts.baseEvidence.verifiedAt.getTime() || request.evidence.verifiedAt > now)) return deny(ADMISSION_ERROR_CODE.contactEvidenceRequired);
  if (request.evidence.kind === ADMISSION_EVIDENCE_KIND.local && (request.evidence.proofId !== facts.localProof?.id || request.proofId !== facts.localProof.id || request.evidence.verifiedAt.getTime() !== facts.localProof.verifiedAt.getTime())) return deny(ADMISSION_ERROR_CODE.proofUnavailable);
  const decision: AdmissionDecision = { id: input.decisionId, requestId: request.id, tribeId: request.tribeId, userId: request.userId, requestVersion: request.version,
    outcome: ADMISSION_REQUEST_STATUS.approved, actorUserId: null, actorKind: ADMISSION_DECISION_ACTOR_KIND.system, rule: ADMISSION_DECISION_RULE.automatic,
    policyVersion: policy.version, verificationEpoch: policy.verificationEpoch, internalReason: null, externalMessage: null, decidedAt: new Date(now), membershipEffectId: null, evidenceSnapshot: snapshotAdmissionDecisionEvidence(request.evidence) };
  return { allowed: true, request: { ...request, status: ADMISSION_REQUEST_STATUS.approved, version: request.version + 1, decisionId: decision.id, resolvedAt: new Date(now) }, decision,
    authorization: { entryId: entry.id, version: entry.version }, membershipEffect: { role: TRIBE_MEMBER_ROLE.tribemate, status: outcome.restoredStatus } };
}
