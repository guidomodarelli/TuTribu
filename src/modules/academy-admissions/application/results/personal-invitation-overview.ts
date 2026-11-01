/** Projects authorized private facts into own personal-preview DTOs without revealing the recipient or token. @module personal-invitation-overview-result */
import type { PersonalInvitationOverviewFacts } from "../../domain/repositories/personal-invitation-overview-reader";
import { evaluateAdmissionPreview, type AdmissionEligibilityResult, type AdmissionSubmissionFacts } from "../../domain/policies/admission-eligibility";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_SOURCE_KIND, ADMISSION_OUTCOME, ADMISSION_INVITATION_STATUS, ADMISSION_DENIAL_REASON } from "../../constants/admission-eligibility";
import { ADMISSION_POLICY_MODE } from "../../constants/admission-policy";
import { ADMISSION_CONTACT_TYPE } from "../../constants/admission-contact";
import { ADMISSION_REQUEST_STATUS } from "../../constants/admission-request";
import { ADMISSION_OVERVIEW_STATE, ADMISSION_NEXT_ACTION } from "../../constants/admission-public-contract";
import { ADMISSION_OVERVIEW_MESSAGE } from "../../constants/admission-overview";
import { PERSONAL_INVITATION_OVERVIEW_STATE, PERSONAL_INVITATION_OVERVIEW_MESSAGE } from "../../constants/personal-invitation-overview";
import { personalInvitationOverviewSchema } from "../../constants/personal-invitation-overview-schemas";
import { admissionOwnRequestSchema } from "./admission-flow-result-schemas";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";

/** @returns The same closed view for absence, wrong account and unusable personal authorization. */
function unavailablePersonalInvitationOverview() {
  return personalInvitationOverviewSchema.parse({ state: PERSONAL_INVITATION_OVERVIEW_STATE.unavailable, safeMessage: PERSONAL_INVITATION_OVERVIEW_MESSAGE.unavailable });
}

type PersonalInvitationFacts = Extract<AdmissionSubmissionFacts["source"], { kind: typeof ADMISSION_SOURCE_KIND.personal }>["invitation"];
type PersonalInvitationOverviewView = PersonalInvitationOverviewFacts["overview"];
/** Viewer-relative facts already derived from the own overview. */
type PersonalInvitationViewerState = { activeMember: boolean; pending: boolean; ownedRedemption: boolean; waiting: boolean };

/** @param facts - Current private inward facts or absence. @param viewer - Revalidated native user/email only. @param now - Fresh caller clock after reads. @returns A guarded generic or authorized preview, never a recipient/contact lookup result. */
export function projectPersonalInvitationOverview(facts: PersonalInvitationOverviewFacts | null, viewer: { userId: string; normalizedEmail: string }, now: Date) {
  if (facts?.eligibility.source.kind !== ADMISSION_SOURCE_KIND.personal) return unavailablePersonalInvitationOverview();
  const invitation = facts.eligibility.source.invitation;
  const eligibility = { ...facts.eligibility, now }, overview = facts.overview;
  if (eligibility.account?.userId !== viewer.userId || eligibility.tribe.id !== overview.tribe.id || invitation.tribeId !== overview.tribe.id || policiesDiverge(eligibility.policy, overview) || tribeFactsDiverge(eligibility, overview)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
  const membership = overview.membership;
  const request = overview.request === null ? null : admissionOwnRequestSchema.parse(overview.request);
  const activeMember = membership?.status === TRIBE_MEMBERSHIP_STATUS.active || membership?.status === TRIBE_MEMBERSHIP_STATUS.muted;
  const pending = request?.status === ADMISSION_REQUEST_STATUS.pending && now < new Date(request.expiresAt);
  const ownedRedemption = invitation.status === ADMISSION_INVITATION_STATUS.redeemed && facts.redeemedByUserId === viewer.userId && facts.redeemedRequestId === request?.id && request.source === ADMISSION_SOURCE_KIND.personal;
  // A cancelled, expired or rejected request keeps its retry wait for every source: the writer refuses a new one until then.
  const waiting = !activeMember && !pending && Boolean(request?.retryAllowedAt && now < new Date(request.retryAllowedAt));
  const viewerState = { activeMember, pending, ownedRedemption, waiting };
  if (hidesInvitationFromViewer({ facts, eligibility, invitation, viewer, viewerState })) return unavailablePersonalInvitationOverview();
  const evaluated = evaluateAdmissionPreview(eligibility);
  if (hidesEvaluatedInvitation({ eligibility, invitation, evaluated, viewerState })) return unavailablePersonalInvitationOverview();
  const expectedOutcome = eligibility.policy?.mode === ADMISSION_POLICY_MODE.allowlist ? ADMISSION_OUTCOME.admitted : ADMISSION_OUTCOME.pending;
  const state = overviewState(viewerState, evaluated);
  const safeMessage = overviewSafeMessage(viewerState, state, expectedOutcome);
  const nextAction = overviewNextAction(viewerState, state);
  return personalInvitationOverviewSchema.parse({ state: PERSONAL_INVITATION_OVERVIEW_STATE.available, requiresAllowlist: invitation.requiresAllowlist, expectedOutcome, overview: { tribe: { slug: overview.tribe.slug, name: overview.tribe.name, accessModel: overview.tribe.accessModel }, policy: overview.policy, state, nextAction, safeMessage, ...(pending || waiting ? { request } : {}), ...(state === ADMISSION_OVERVIEW_STATE.verificationRequired && overview.verification ? { verification: overview.verification } : {}) } });
}

/** @returns Whether the private policy and the public policy summary describe different rules. */
function policiesDiverge(policy: AdmissionSubmissionFacts["policy"], overview: PersonalInvitationOverviewView): boolean {
  const publicPolicy = overview.policy;
  if (policy === null) return publicPolicy !== null;
  return !publicPolicy || policy.tribeId !== overview.tribe.id || policy.mode !== publicPolicy.mode || policy.version !== publicPolicy.version || policy.contactType !== publicPolicy.contactType || policy.requiresAdditionalVerification !== publicPolicy.requiresAdditionalVerification || Boolean(policy.requiresWhatsappNumber) !== Boolean(publicPolicy.requiresWhatsappNumber) || policy.isOpen !== publicPolicy.isOpen;
}

/** @returns Whether the private and public tribe activation facts disagree. */
function tribeFactsDiverge(eligibility: AdmissionSubmissionFacts, overview: PersonalInvitationOverviewView): boolean {
  return eligibility.tribe.controlActivated !== overview.tribe.controlActivated || eligibility.tribe.evaluatorEnabled !== overview.tribe.evaluatorEnabled || eligibility.tribe.recoveryLocked !== overview.recoveryLocked;
}

/** @returns Whether the invitation must look absent before evaluation: another recipient, a contact bound to someone else, or an unusable invitation. */
function hidesInvitationFromViewer({ facts, eligibility, invitation, viewer, viewerState }: { facts: PersonalInvitationOverviewFacts; eligibility: AdmissionSubmissionFacts; invitation: PersonalInvitationFacts; viewer: { normalizedEmail: string; userId: string }; viewerState: PersonalInvitationViewerState }): boolean {
  const { activeMember, ownedRedemption } = viewerState;
  if (!ownedRedemption && (!facts.recipientMatchesAccount || invitation.contact.type === ADMISSION_CONTACT_TYPE.email && invitation.contact.value !== viewer.normalizedEmail)) return true;
  if (eligibility.contactBinding && eligibility.contactBinding.ownerUserId !== viewer.userId && eligibility.contactBinding.contact.type === invitation.contact.type && eligibility.contactBinding.contact.value === invitation.contact.value) return true;
  if (!facts.tokenAvailable && !activeMember && !ownedRedemption || !activeMember && !ownedRedemption && invitation.status !== ADMISSION_INVITATION_STATUS.active) return true;
  return !activeMember && !ownedRedemption && (invitation.authorizationRevoked || invitation.expiresAt !== null && eligibility.now >= invitation.expiresAt);
}

/** @returns Whether the evaluated preview must look absent: a denial, an allowlist mismatch or a contact conflict. */
function hidesEvaluatedInvitation({ eligibility, invitation, evaluated, viewerState }: { eligibility: AdmissionSubmissionFacts; invitation: PersonalInvitationFacts; evaluated: AdmissionEligibilityResult; viewerState: PersonalInvitationViewerState }): boolean {
  if (!viewerState.activeMember && !viewerState.pending && (evaluated.outcome === ADMISSION_OUTCOME.denied || evaluated.outcome === ADMISSION_OUTCOME.alreadyMember)) return true;
  if (evaluated.outcome === ADMISSION_OUTCOME.verificationRequired && invitation.requiresAllowlist && (!eligibility.allowlistEntry?.enabled || eligibility.allowlistEntry.contact.type !== invitation.contact.type || eligibility.allowlistEntry.contact.value !== invitation.contact.value)) return true;
  return evaluated.outcome === ADMISSION_OUTCOME.denied && evaluated.reason === ADMISSION_DENIAL_REASON.contactConflict;
}

/** @returns Member first, then pending request, then the retry wait, then verification, else available. */
function overviewState(viewerState: PersonalInvitationViewerState, evaluated: AdmissionEligibilityResult) {
  if (viewerState.activeMember) return ADMISSION_OVERVIEW_STATE.alreadyMember;
  if (viewerState.pending) return ADMISSION_OVERVIEW_STATE.pending;
  if (viewerState.waiting) return ADMISSION_OVERVIEW_STATE.closed;
  return evaluated.outcome === ADMISSION_OUTCOME.verificationRequired ? ADMISSION_OVERVIEW_STATE.verificationRequired : ADMISSION_OVERVIEW_STATE.available;
}

/** @returns The safe message matching the viewer state and the expected outcome. */
function overviewSafeMessage(viewerState: PersonalInvitationViewerState, state: ReturnType<typeof overviewState>, expectedOutcome: string) {
  if (viewerState.activeMember) return ADMISSION_OVERVIEW_MESSAGE.alreadyMember;
  if (viewerState.pending) return ADMISSION_OVERVIEW_MESSAGE.pending;
  if (viewerState.waiting) return ADMISSION_OVERVIEW_MESSAGE.waiting;
  if (state === ADMISSION_OVERVIEW_STATE.verificationRequired) return PERSONAL_INVITATION_OVERVIEW_MESSAGE.verification;
  return expectedOutcome === ADMISSION_OUTCOME.admitted ? PERSONAL_INVITATION_OVERVIEW_MESSAGE.admitted : PERSONAL_INVITATION_OVERVIEW_MESSAGE.pending;
}

/** @returns The next action matching the viewer state. */
function overviewNextAction(viewerState: PersonalInvitationViewerState, state: ReturnType<typeof overviewState>) {
  if (viewerState.activeMember) return ADMISSION_NEXT_ACTION.openAcademy;
  if (viewerState.pending) return ADMISSION_NEXT_ACTION.viewRequest;
  if (viewerState.waiting) return ADMISSION_NEXT_ACTION.wait;
  return state === ADMISSION_OVERVIEW_STATE.verificationRequired ? ADMISSION_NEXT_ACTION.verifyContact : ADMISSION_NEXT_ACTION.requestAdmission;
}
