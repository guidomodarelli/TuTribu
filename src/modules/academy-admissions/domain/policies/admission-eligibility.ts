/**
 * Evaluates admission and review without writing membership, claims, or notifications.
 *
 * @module admission-eligibility
 */
import {
  ADMISSION_ACTION, ADMISSION_DENIAL_REASON, ADMISSION_EVIDENCE_KIND,
  ADMISSION_GLOBAL_EMAIL_AUTHORITY, ADMISSION_INVITATION_STATUS,
  ADMISSION_MEMBERSHIP_EFFECT, ADMISSION_OUTCOME, ADMISSION_PROOF_STATUS,
  ADMISSION_SOURCE_KIND, ADMISSION_VERIFICATION_PURPOSE,
} from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_POLICY_MODE } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_LIMIT } from "@/src/modules/academy-admissions/constants/admission-limits";
import type { AdmissionPolicy } from "@/src/modules/academy-admissions/domain/entities/admission-policy";
import type { AdmissionContact } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { TRIBE_MEMBERSHIP_STATUS, TRIBE_MEMBERSHIP_STATUS_REASON } from "@/src/modules/tribes/constants/tribe-page-access";

export type AdmissionMembershipFacts = {
  tribeId: string; userId: string; role: "leader" | "guardian" | "tribemate";
  status: "active" | "muted" | "blocked" | "removed";
  statusReason: "none" | "payment_blocked" | "subscription_inactive" | "conduct_blocked";
  commercialRecoveryStatus: "active" | "muted" | null;
};
export type AdmissionLocalProofFacts = {
  id: string; appliedRequestId: string | null;
  userId: string; tribeId: string; contact: AdmissionContact;
  purpose: "admission" | "connection_diagnostic";
  verificationEpoch: number; connectionId: string; connectionVersion: number; securityEpoch: string;
  status: "available" | "applied" | "invalid"; verifiedAt: Date; applyBefore: Date;
};
export type AdmissionSourceFacts =
  | { kind: "common" }
  | { kind: "legacy" }
  | { kind: "personal"; invitation: {
    tribeId: string; contact: AdmissionContact; requiresAllowlist: boolean;
    status: "active" | "redeemed" | "revoked" | "expired";
    authorizationRevoked: boolean; expiresAt: Date | null;
  } };

/** Own facts projected from authorized readers; none are browser permissions. */
export type AdmissionSubmissionFacts = {
  now: Date;
  tribe: { id: string; isAcademy: boolean; controlActivated: boolean; evaluatorEnabled: boolean; recoveryLocked: boolean };
  account: { userId: string; normalizedEmail: string; googleAccount: { id: string; subject: string } | null } | null;
  policy: AdmissionPolicy | null;
  source: AdmissionSourceFacts;
  contact: AdmissionContact | null;
  /** Declared group number never grants contact evidence or binding authority. */
  whatsappNumber?: string | null;
  baseEvidence: { userId: string; accountId: string; subject: string; normalizedEmail: string; authority: "gmail" | "workspace" | "insufficient"; invalidated: boolean } | null;
  localProof: AdmissionLocalProofFacts | null;
  currentConnection: { id: string; version: number; securityEpoch: string } | null;
  membership: AdmissionMembershipFacts | null;
  allowlistEntry: { tribeId: string; contact: AdmissionContact; enabled: boolean; boundUserId: string | null } | null;
  contactBinding: { ownerUserId: string; contact: AdmissionContact } | null;
};
type DenialReason = (typeof ADMISSION_DENIAL_REASON)[keyof typeof ADMISSION_DENIAL_REASON];
type EvidenceKind = (typeof ADMISSION_EVIDENCE_KIND)[keyof typeof ADMISSION_EVIDENCE_KIND];
export type AdmissionEligibilityResult =
  | { outcome: "denied"; reason: DenialReason }
  | { outcome: "verification_required"; reason: DenialReason }
  | { outcome: "already_member"; membershipEffect: "none" }
  | { outcome: "pending"; evidenceKind: EvidenceKind; bindContact: boolean; requiresExceptionReason: boolean }
  | { outcome: "admitted"; evidenceKind: EvidenceKind; bindContact: boolean; membershipEffect: "create" | "recover"; restoredStatus: "active" | "muted" };

/** Compares canonical contacts without using names, aliases, or routing hints. */
function sameContact(first: AdmissionContact | null, second: AdmissionContact | null): boolean {
  return first !== null && second !== null && first.type === second.type && first.value === second.value;
}

/** Checks previously captured base authority against the currently linked account. */
function hasCurrentBaseEmail(facts: AdmissionSubmissionFacts): boolean {
  const evidence = facts.baseEvidence;
  const account = facts.account;
  return Boolean(account?.googleAccount && evidence && !evidence.invalidated
    && evidence.authority !== ADMISSION_GLOBAL_EMAIL_AUTHORITY.insufficient
    && evidence.userId === account.userId && evidence.accountId === account.googleAccount.id
    && evidence.subject === account.googleAccount.subject
    && evidence.normalizedEmail === account.normalizedEmail
    && facts.contact?.type === ADMISSION_CONTACT_TYPE.email
    && facts.contact.value === account.normalizedEmail);
}

/** Checks an available local proof without a provider call or quota/country reset. */
function hasAvailableLocalProof(facts: AdmissionSubmissionFacts): boolean {
  const proof = facts.localProof;
  const connection = facts.currentConnection;
  return Boolean(proof && facts.account && facts.policy && connection
    && proof.status === ADMISSION_PROOF_STATUS.available
    && proof.appliedRequestId === null
    && proof.purpose === ADMISSION_VERIFICATION_PURPOSE.admission
    && proof.userId === facts.account.userId && proof.tribeId === facts.tribe.id
    && proof.verificationEpoch === facts.policy.verificationEpoch
    && proof.connectionId === connection.id && proof.connectionVersion === connection.version
    && proof.securityEpoch === connection.securityEpoch
    && proof.verifiedAt.getTime() <= facts.now.getTime()
    && facts.now.getTime() - proof.verifiedAt.getTime() < ADMISSION_LIMIT.verificationProofFreshnessMs
    && facts.now.getTime() < proof.applyBefore.getTime()
    && sameContact(proof.contact, facts.contact));
}

/**
 * Checks historical applied evidence without repeating its presentation freshness.
 *
 * @param facts - Current account, contact, policy, and evaluation clock.
 * @param proof - Evidence already attached to this pending request by its owner.
 * @param requestId - Exact pending request that consumed this proof.
 * @returns Whether its scope and current epoch remain usable for this review.
 */
function hasUsableAppliedProof(facts: AdmissionSubmissionFacts, proof: AdmissionLocalProofFacts | null, requestId: string | null): boolean {
  return Boolean(proof && facts.account && facts.policy
    && proof.status === ADMISSION_PROOF_STATUS.applied
    && requestId !== null && proof.appliedRequestId === requestId
    && proof.purpose === ADMISSION_VERIFICATION_PURPOSE.admission
    && proof.userId === facts.account.userId && proof.tribeId === facts.tribe.id
    && (!facts.policy.requiresAdditionalVerification || proof.verificationEpoch === facts.policy.verificationEpoch)
    && (!facts.currentConnection || proof.securityEpoch === facts.currentConnection.securityEpoch)
    && proof.verifiedAt.getTime() <= facts.now.getTime()
    && sameContact(proof.contact, facts.contact));
}

/**
 * Evaluates submission/review rules from current, locked own facts.
 *
 * This pure result is a decision proposal; application still requires explicit
 * confirmation, rate limits, operation-ledger replay/CAS, and an atomic writer.
 *
 * @param facts - Current account, policy, evidence, invitation, and membership facts.
 * @param stage - Read-only form preview, new presentation, or existing pending review.
 * @param appliedProof - Evidence previously attached to this request for review only.
 * @param requestId - Pending request owning applied evidence in the review phase.
 * @returns A safe domain outcome without changing any supplied resource.
 */
function evaluateAdmission(
  facts: AdmissionSubmissionFacts,
  stage: AdmissionEvaluationStage,
  appliedProof: AdmissionLocalProofFacts | null,
  requestId: string | null,
): AdmissionEligibilityResult {
  const account = facts.account;
  if (!account) return deniedAdmission(ADMISSION_DENIAL_REASON.unauthenticated);
  const membership = facts.membership;
  if (membership && (membership.tribeId !== facts.tribe.id || membership.userId !== account.userId)) return deniedAdmission(ADMISSION_DENIAL_REASON.scopeMismatch);
  if (membership?.status === TRIBE_MEMBERSHIP_STATUS.active || membership?.status === TRIBE_MEMBERSHIP_STATUS.muted) {
    return { outcome: ADMISSION_OUTCOME.alreadyMember, membershipEffect: ADMISSION_MEMBERSHIP_EFFECT.none };
  }
  const policy = facts.policy;
  if (!facts.tribe.isAcademy || !facts.tribe.controlActivated || !facts.tribe.evaluatorEnabled || facts.tribe.recoveryLocked || !policy?.isOpen || !policy.activatedAt) return deniedAdmission(ADMISSION_DENIAL_REASON.closed);
  // Stored policies may carry an obsolete discriminator; close them instead of falling through.
  const storedMode = policy.mode as string, storedContactType = policy.contactType as string;
  const isSupportedPolicy = (storedMode === ADMISSION_POLICY_MODE.manualReview || storedMode === ADMISSION_POLICY_MODE.allowlist)
    && (storedContactType === ADMISSION_CONTACT_TYPE.email || storedContactType === ADMISSION_CONTACT_TYPE.phone);
  if (!isSupportedPolicy) return deniedAdmission(ADMISSION_DENIAL_REASON.closed);
  const blocked = admissionBlockReason({ facts, account, policy, stage });
  if (blocked) return deniedAdmission(blocked);

  const evidenceKind = resolveEvidenceKind({ facts, policy, stage, appliedProof, requestId });
  if (evidenceKind === null) return { outcome: ADMISSION_OUTCOME.verificationRequired, reason: ADMISSION_DENIAL_REASON.proofRequired };
  const hasTrustedContact = evidenceKind === ADMISSION_EVIDENCE_KIND.base || evidenceKind === ADMISSION_EVIDENCE_KIND.local;
  if (hasTrustedContact && facts.contactBinding && sameContact(facts.contactBinding.contact, facts.contact) && facts.contactBinding.ownerUserId !== account.userId) return deniedAdmission(ADMISSION_DENIAL_REASON.contactConflict);

  const invitation = facts.source.kind === ADMISSION_SOURCE_KIND.personal ? facts.source.invitation : null;
  const invitationDenial = invitation ? invitationDenialReason({ invitation, facts, policy, stage, hasTrustedContact }) : null;
  if (invitationDenial) return deniedAdmission(invitationDenial);
  return evaluateAllowlistOutcome({ facts, account, policy, invitation, evidenceKind, hasTrustedContact });
}

type AdmissionEvaluationStage = "submission" | "review" | "preview";
type AdmissionAccountFacts = NonNullable<AdmissionSubmissionFacts["account"]>;
type PersonalInvitationFacts = Extract<AdmissionSourceFacts, { kind: "personal" }>["invitation"];

/** @param reason - Closed denial reason. @returns The denied outcome. */
function deniedAdmission(reason: DenialReason): AdmissionEligibilityResult {
  return { outcome: ADMISSION_OUTCOME.denied, reason };
}

/** @param membership - Current non-legible membership. @returns Why that membership cannot be recovered by admission, or `null` for a commercial tribemate recovery. */
function membershipRestriction(membership: AdmissionMembershipFacts): DenialReason | null {
  const isCommercial = (membership.status === TRIBE_MEMBERSHIP_STATUS.blocked && membership.statusReason === TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked)
    || (membership.status === TRIBE_MEMBERSHIP_STATUS.removed && membership.statusReason === TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive);
  if (!isCommercial || membership.role !== TRIBE_MEMBER_ROLE.tribemate) return ADMISSION_DENIAL_REASON.membershipRestricted;
  return membership.commercialRecoveryStatus === null ? ADMISSION_DENIAL_REASON.recoveryUnknown : null;
}

/** @returns The first policy, membership, declared-number or contact rule the presentation breaks, or `null`. */
function admissionBlockReason({ facts, account, policy, stage }: { facts: AdmissionSubmissionFacts; account: AdmissionAccountFacts; policy: AdmissionPolicy; stage: AdmissionEvaluationStage }): DenialReason | null {
  if (policy.tribeId !== facts.tribe.id) return ADMISSION_DENIAL_REASON.scopeMismatch;
  const restriction = facts.membership ? membershipRestriction(facts.membership) : null;
  if (restriction) return restriction;
  if (stage !== "preview" && policy.requiresWhatsappNumber && !facts.whatsappNumber) return ADMISSION_DENIAL_REASON.whatsappNumberRequired;
  if (facts.contact && facts.contact.type !== policy.contactType) return ADMISSION_DENIAL_REASON.contactTypeMismatch;
  if (facts.contact?.type === ADMISSION_CONTACT_TYPE.email && facts.contact.value !== account.normalizedEmail) return ADMISSION_DENIAL_REASON.contactAccountMismatch;
  if (policy.contactType === ADMISSION_CONTACT_TYPE.phone && policy.mode === ADMISSION_POLICY_MODE.allowlist && !policy.requiresAdditionalVerification) return ADMISSION_DENIAL_REASON.closed;
  return null;
}

/** @returns Local evidence when a usable proof exists, base evidence for a current Google email, else declared or none; `null` when the policy requires a proof that is missing. */
function resolveEvidenceKind({ facts, policy, stage, appliedProof, requestId }: { facts: AdmissionSubmissionFacts; policy: AdmissionPolicy; stage: AdmissionEvaluationStage; appliedProof: AdmissionLocalProofFacts | null; requestId: string | null }): EvidenceKind | null {
  const hasAppliedEvidence = stage === "review" && hasUsableAppliedProof(facts, appliedProof, requestId);
  if (policy.requiresAdditionalVerification) {
    const hasLocalEvidence = stage === "review" ? hasAppliedEvidence : hasAvailableLocalProof(facts);
    return hasLocalEvidence ? ADMISSION_EVIDENCE_KIND.local : null;
  }
  if (hasAppliedEvidence) return ADMISSION_EVIDENCE_KIND.local;
  if (hasCurrentBaseEmail(facts)) return ADMISSION_EVIDENCE_KIND.base;
  return facts.contact ? ADMISSION_EVIDENCE_KIND.declared : ADMISSION_EVIDENCE_KIND.none;
}

/** @returns Why the personal invitation cannot be used at this stage by this contact, or `null`. */
function invitationDenialReason({ invitation, facts, policy, stage, hasTrustedContact }: { invitation: PersonalInvitationFacts; facts: AdmissionSubmissionFacts; policy: AdmissionPolicy; stage: AdmissionEvaluationStage; hasTrustedContact: boolean }): DenialReason | null {
  const expectedStatus = stage === "review" ? ADMISSION_INVITATION_STATUS.redeemed : ADMISSION_INVITATION_STATUS.active;
  const isNewInvitationExpired = stage !== "review" && invitation.expiresAt && facts.now.getTime() >= invitation.expiresAt.getTime();
  if (invitation.tribeId !== facts.tribe.id || invitation.status !== expectedStatus || invitation.authorizationRevoked || isNewInvitationExpired) return ADMISSION_DENIAL_REASON.invitationUnusable;
  if (stage !== "review" && policy.contactType === ADMISSION_CONTACT_TYPE.phone && !policy.requiresAdditionalVerification) return ADMISSION_DENIAL_REASON.phoneInvitationUnavailable;
  if (!hasTrustedContact || !sameContact(invitation.contact, facts.contact)) return ADMISSION_DENIAL_REASON.invitationRecipientUnproven;
  return null;
}

/** @returns Denial for an unmet list without exceptions, pending for manual review or an exception, else admission with its membership effect. */
function evaluateAllowlistOutcome({ facts, account, policy, invitation, evidenceKind, hasTrustedContact }: { facts: AdmissionSubmissionFacts; account: AdmissionAccountFacts; policy: AdmissionPolicy; invitation: PersonalInvitationFacts | null; evidenceKind: EvidenceKind; hasTrustedContact: boolean }): AdmissionEligibilityResult {
  const entry = facts.allowlistEntry;
  const matchesAllowlist = hasTrustedContact && entry?.tribeId === facts.tribe.id && entry.enabled
    && sameContact(entry.contact, facts.contact) && (entry.boundUserId === null || entry.boundUserId === account.userId);
  const requiresAllowlist = invitation ? invitation.requiresAllowlist : policy.mode === ADMISSION_POLICY_MODE.allowlist;
  let requiresExceptionReason = false;
  if (requiresAllowlist && !matchesAllowlist) {
    if (invitation || !policy.allowCommonExceptions) return deniedAdmission(ADMISSION_DENIAL_REASON.allowlistUnmet);
    requiresExceptionReason = true;
  }
  if (policy.mode === ADMISSION_POLICY_MODE.manualReview || requiresExceptionReason) {
    return { outcome: ADMISSION_OUTCOME.pending, evidenceKind, bindContact: hasTrustedContact, requiresExceptionReason };
  }
  const membership = facts.membership;
  return {
    outcome: ADMISSION_OUTCOME.admitted, evidenceKind, bindContact: hasTrustedContact,
    membershipEffect: membership ? ADMISSION_MEMBERSHIP_EFFECT.recover : ADMISSION_MEMBERSHIP_EFFECT.create,
    restoredStatus: membership?.commercialRecoveryStatus ?? TRIBE_MEMBERSHIP_STATUS.active,
  };
}

/**
 * Evaluates a new presentation without creating requests, bindings, or membership.
 *
 * @param facts - Current locked facts resolved through authorized own ports.
 * @returns A proposal requiring explicit confirmation and the atomic writer.
 */
export function evaluateAdmissionSubmission(facts: AdmissionSubmissionFacts): AdmissionEligibilityResult {
  return evaluateAdmission(facts, "submission", null, null);
}

/**
 * Evaluates a read-only form preview before the person supplies their declared group number.
 * @param facts - Current private account, invitation, contact and policy facts.
 * @returns A prediction that defers only declared-number completion; writers must use submission or review evaluation.
 */
export function evaluateAdmissionPreview(facts: AdmissionSubmissionFacts): AdmissionEligibilityResult {
  return evaluateAdmission(facts, "preview", null, null);
}

/** Represents a scoped account; absent membership never invents an active role. */
export type AdmissionActorFacts = { userId: string; tribeId: string; role: "leader" | "guardian" | "tribemate" | null; status: "active" | "muted" | "blocked" | "removed" | null };
export type AdmissionAction = (typeof ADMISSION_ACTION)[keyof typeof ADMISSION_ACTION];

/**
 * Evaluates current scoped permissions; public secret reads and grants are never allowed.
 *
 * @param actor - Current role/status read from the membership owner, not a cookie role.
 * @param action - Admission-owned operation being authorized.
 * @param resource - Target tribe and, for own-request or decision actions, the applicant account.
 * @returns Whether the current actor can perform this action on this resource.
 */
export function canPerformAdmissionAction(actor: AdmissionActorFacts | null, action: AdmissionAction, resource: { tribeId: string; applicantUserId?: string }): boolean {
  if (actor?.tribeId !== resource.tribeId) return false;
  if (action === ADMISSION_ACTION.readSecret || action === ADMISSION_ACTION.grantProductOrRole) return false;
  if (action === ADMISSION_ACTION.readOwnRequest || action === ADMISSION_ACTION.cancelOwnRequest || action === ADMISSION_ACTION.attachOwnProof || action === ADMISSION_ACTION.updateOwnWhatsappNumber) return actor.userId === resource.applicantUserId;
  const isLeader = actor.status === TRIBE_MEMBERSHIP_STATUS.active && actor.role === TRIBE_MEMBER_ROLE.leader;
  const isReviewer = actor.status === TRIBE_MEMBERSHIP_STATUS.active && (actor.role === TRIBE_MEMBER_ROLE.leader || actor.role === TRIBE_MEMBER_ROLE.guardian);
  if (action === ADMISSION_ACTION.decideRequest || action === ADMISSION_ACTION.rejectRequest) return isReviewer && Boolean(resource.applicantUserId) && actor.userId !== resource.applicantUserId;
  if (action === ADMISSION_ACTION.readInbox || action === ADMISSION_ACTION.readReviewHistory || action === ADMISSION_ACTION.readConnectionAlert || action === ADMISSION_ACTION.updateOwnNotificationPreferences) return isReviewer;
  // Every remaining action is listed explicitly so a new action stays denied until it is classified here.
  switch (action) {
    case ADMISSION_ACTION.manageConnection:
    case ADMISSION_ACTION.readPolicy: case ADMISSION_ACTION.configurePolicy: case ADMISSION_ACTION.manageAllowlist:
    case ADMISSION_ACTION.manageInvitations: case ADMISSION_ACTION.readConnectionMetadata:
    case ADMISSION_ACTION.cancelByManagement: case ADMISSION_ACTION.allowEarlyRetry:
    case ADMISSION_ACTION.readAudit:
      return isLeader;
    default:
      return false;
  }
}

/** Retains attached historical proof without treating its original apply window as expiry. */
export type PendingAdmissionReviewFacts = AdmissionSubmissionFacts & {
  request: { id: string; userId: string; expiresAt: Date; source: AdmissionSourceFacts; attachedEvidence: AdmissionLocalProofFacts | null };
  reviewer: AdmissionActorFacts | null;
  exceptionReason?: string;
};

/**
 * Evaluates a pending request against the current policy without approving it.
 *
 * @param facts - Current request scope, evidence, policy, and reviewer facts.
 * @returns Eligibility/reason while always requiring an explicit reviewer decision.
 */
export function evaluatePendingAdmissionReview(facts: PendingAdmissionReviewFacts): { eligible: boolean; requiresExplicitDecision: true; reason?: DenialReason } {
  const failure = (reason: DenialReason) => ({ eligible: false, requiresExplicitDecision: true as const, reason });
  if (facts.account?.userId !== facts.request.userId) return failure(ADMISSION_DENIAL_REASON.scopeMismatch);
  if (!canPerformAdmissionAction(facts.reviewer, ADMISSION_ACTION.decideRequest, { tribeId: facts.tribe.id, applicantUserId: facts.request.userId })) return failure(ADMISSION_DENIAL_REASON.reviewerUnauthorized);
  const evaluation = evaluatePendingAdmissionEligibility(facts);
  if (!evaluation.eligible) return failure(evaluation.reason);
  if (evaluation.requiresExceptionReason && !facts.exceptionReason?.trim()) return failure(ADMISSION_DENIAL_REASON.exceptionReasonRequired);
  return { eligible: true, requiresExplicitDecision: true };
}

/**
 * Evaluates current pending eligibility without granting reviewer authority or exposing internal reasons.
 * @param facts - Actual own request and current server facts, independently scoped by its reader.
 * @returns Current business restriction or eligibility that still requires an explicit reviewer decision.
 */
export function evaluatePendingAdmissionEligibility(facts: Omit<PendingAdmissionReviewFacts, "reviewer" | "exceptionReason">):
  | { eligible: false; reason: DenialReason }
  | { eligible: true; requiresExceptionReason: boolean } {
  const failure = (reason: DenialReason) => ({ eligible: false as const, reason });
  if (facts.account?.userId !== facts.request.userId) return failure(ADMISSION_DENIAL_REASON.scopeMismatch);
  if (facts.now.getTime() >= facts.request.expiresAt.getTime()) return failure(ADMISSION_DENIAL_REASON.requestExpired);
  const attached = facts.request.attachedEvidence;
  if (attached?.status === ADMISSION_PROOF_STATUS.invalid) return failure(ADMISSION_DENIAL_REASON.evidenceRevoked);
  const result = evaluateAdmission({ ...facts, source: facts.request.source }, "review", attached, facts.request.id);
  if (result.outcome === ADMISSION_OUTCOME.denied || result.outcome === ADMISSION_OUTCOME.verificationRequired) return failure(result.reason);
  if (result.outcome === ADMISSION_OUTCOME.alreadyMember) return failure(ADMISSION_DENIAL_REASON.closed);
  return { eligible: true, requiresExceptionReason: result.outcome === ADMISSION_OUTCOME.pending && result.requiresExceptionReason };
}

/**
 * Determines corrective proof needs from the same current pending facts used for eligibility.
 * @param facts - Original request and current policy/evidence/clock, with no reviewer permission.
 * @returns Whether the live pending requires a fresh contact check; expiry always takes precedence.
 */
export function needsPendingAdmissionVerification(facts: Omit<PendingAdmissionReviewFacts, "reviewer" | "exceptionReason">): boolean {
  if (facts.now >= facts.request.expiresAt) return false;
  if (facts.request.attachedEvidence?.status === ADMISSION_PROOF_STATUS.invalid) return true;
  return facts.policy?.requiresAdditionalVerification === true && !hasUsableAppliedProof(facts, facts.request.attachedEvidence, facts.request.id);
}
