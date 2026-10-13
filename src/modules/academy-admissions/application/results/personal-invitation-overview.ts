/** Projects authorized private facts into own personal-preview DTOs without revealing the recipient or token. @module personal-invitation-overview-result */
import type { PersonalInvitationOverviewFacts } from "../../domain/repositories/personal-invitation-overview-reader";
import { evaluateAdmissionSubmission } from "../../domain/policies/admission-eligibility";
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
import { admissionRequestSchema } from "./admission-flow-result-schemas";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";

/** @returns The same closed view for absence, wrong account and unusable personal authorization. */
export function unavailablePersonalInvitationOverview() {
  return personalInvitationOverviewSchema.parse({ state: PERSONAL_INVITATION_OVERVIEW_STATE.unavailable, safeMessage: PERSONAL_INVITATION_OVERVIEW_MESSAGE.unavailable });
}

/** @param facts - Current private inward facts or absence. @param viewer - Revalidated native user/email only. @param now - Fresh caller clock after reads. @returns A guarded generic or authorized preview, never a recipient/contact lookup result. */
export function projectPersonalInvitationOverview(facts: PersonalInvitationOverviewFacts | null, viewer: { userId: string; normalizedEmail: string }, now: Date) {
  if (!facts || facts.eligibility.source.kind !== ADMISSION_SOURCE_KIND.personal) return unavailablePersonalInvitationOverview();
  const invitation = facts.eligibility.source.invitation;
  const eligibility = { ...facts.eligibility, now }, overview = facts.overview;
  if (!eligibility.account || eligibility.account.userId !== viewer.userId || eligibility.tribe.id !== overview.tribe.id || invitation.tribeId !== overview.tribe.id) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
  const policy = eligibility.policy, publicPolicy = overview.policy;
  if (policy === null ? publicPolicy !== null : !publicPolicy || policy.tribeId !== overview.tribe.id || policy.mode !== publicPolicy.mode || policy.version !== publicPolicy.version || policy.contactType !== publicPolicy.contactType || policy.requiresAdditionalVerification !== publicPolicy.requiresAdditionalVerification || policy.isOpen !== publicPolicy.isOpen) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
  if (eligibility.tribe.controlActivated !== overview.tribe.controlActivated || eligibility.tribe.evaluatorEnabled !== overview.tribe.evaluatorEnabled || eligibility.tribe.recoveryLocked !== overview.recoveryLocked) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
  const membership = overview.membership;
  const request = overview.request === null ? null : admissionRequestSchema.parse(overview.request);
  const activeMember = membership?.status === TRIBE_MEMBERSHIP_STATUS.active || membership?.status === TRIBE_MEMBERSHIP_STATUS.muted;
  const pending = request?.status === ADMISSION_REQUEST_STATUS.pending && now < new Date(request.expiresAt);
  const ownedRedemption = invitation.status === ADMISSION_INVITATION_STATUS.redeemed && facts.redeemedByUserId === viewer.userId && facts.redeemedRequestId === request?.id && request?.source === ADMISSION_SOURCE_KIND.personal;
  if (!ownedRedemption && (!facts.recipientMatchesAccount || invitation.contact.type === ADMISSION_CONTACT_TYPE.email && invitation.contact.value !== viewer.normalizedEmail)) return unavailablePersonalInvitationOverview();
  if (eligibility.contactBinding && eligibility.contactBinding.ownerUserId !== viewer.userId && eligibility.contactBinding.contact.type === invitation.contact.type && eligibility.contactBinding.contact.value === invitation.contact.value) return unavailablePersonalInvitationOverview();
  if (!facts.tokenAvailable && !activeMember && !ownedRedemption || !activeMember && !ownedRedemption && invitation.status !== ADMISSION_INVITATION_STATUS.active) return unavailablePersonalInvitationOverview();
  if (!activeMember && !ownedRedemption && (invitation.authorizationRevoked || invitation.expiresAt && now >= invitation.expiresAt)) return unavailablePersonalInvitationOverview();
  const evaluated = evaluateAdmissionSubmission(eligibility);
  if (!activeMember && !pending && (evaluated.outcome === ADMISSION_OUTCOME.denied || evaluated.outcome === ADMISSION_OUTCOME.alreadyMember)) return unavailablePersonalInvitationOverview();
  if (evaluated.outcome === ADMISSION_OUTCOME.verificationRequired && invitation.requiresAllowlist && (!eligibility.allowlistEntry?.enabled || eligibility.allowlistEntry.contact.type !== invitation.contact.type || eligibility.allowlistEntry.contact.value !== invitation.contact.value)) return unavailablePersonalInvitationOverview();
  if (evaluated.outcome === ADMISSION_OUTCOME.denied && evaluated.reason === ADMISSION_DENIAL_REASON.contactConflict) return unavailablePersonalInvitationOverview();
  const expectedOutcome = eligibility.policy?.mode === ADMISSION_POLICY_MODE.allowlist ? ADMISSION_OUTCOME.admitted : ADMISSION_OUTCOME.pending;
  const state = activeMember ? ADMISSION_OVERVIEW_STATE.alreadyMember : pending ? ADMISSION_OVERVIEW_STATE.pending : evaluated.outcome === ADMISSION_OUTCOME.verificationRequired ? ADMISSION_OVERVIEW_STATE.verificationRequired : ADMISSION_OVERVIEW_STATE.available;
  const safeMessage = activeMember ? ADMISSION_OVERVIEW_MESSAGE.alreadyMember : pending ? ADMISSION_OVERVIEW_MESSAGE.pending : state === ADMISSION_OVERVIEW_STATE.verificationRequired ? PERSONAL_INVITATION_OVERVIEW_MESSAGE.verification : expectedOutcome === ADMISSION_OUTCOME.admitted ? PERSONAL_INVITATION_OVERVIEW_MESSAGE.admitted : PERSONAL_INVITATION_OVERVIEW_MESSAGE.pending;
  const nextAction = activeMember ? ADMISSION_NEXT_ACTION.openAcademy : pending ? ADMISSION_NEXT_ACTION.viewRequest : state === ADMISSION_OVERVIEW_STATE.verificationRequired ? ADMISSION_NEXT_ACTION.verifyContact : ADMISSION_NEXT_ACTION.requestAdmission;
  return personalInvitationOverviewSchema.parse({ state: PERSONAL_INVITATION_OVERVIEW_STATE.available, requiresAllowlist: invitation.requiresAllowlist, expectedOutcome, overview: { tribe: { slug: overview.tribe.slug, name: overview.tribe.name, accessModel: overview.tribe.accessModel }, policy: overview.policy, state, nextAction, safeMessage, ...(pending ? { request } : {}), ...(state === ADMISSION_OVERVIEW_STATE.verificationRequired && overview.verification ? { verification: overview.verification } : {}) } });
}
