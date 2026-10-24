/** Resolves current account email trust separately from optional-email preference and dispatch authority. @module admission-notification-recipient-email-policy */
import { GOOGLE_EMAIL_AUTHORITY, GOOGLE_IDENTITY_PROVIDER } from "@/src/modules/auth/constants/google-identity-evidence";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_EVIDENCE_KIND, ADMISSION_PROOF_STATUS, ADMISSION_VERIFICATION_PURPOSE } from "@/src/modules/academy-admissions/constants/admission-eligibility";
import { ADMISSION_NOTIFICATION_AUDIENCE } from "../../constants/admission-notifications";
import { ADMISSION_NOTIFICATION_PREFERENCE_STATUS } from "../../constants/admission-notification-preference";
import type { AdmissionNotificationRecipientEmailFacts, TrustedAdmissionNotificationEmail } from "../entities/admission-notification-recipient-email";
import { resolveAdmissionNotificationAudience } from "./admission-notification-audience";
import { resolveAdmissionNotificationPreference } from "./admission-notification-preference";

/**
 * Selects only the actual account email backed by current linked global capture or its own applied local email proof.
 * @param facts - Private post-lock native facts; clock predicates must be computed by the owning database reader, never the browser.
 * @returns A minimal destination or absence; source lifecycle, capability, preference and dispatch still require current authorization.
 */
export function resolveAdmissionNotificationRecipientEmail(facts: AdmissionNotificationRecipientEmailFacts): TrustedAdmissionNotificationEmail | null {
  const { scope, source, account, runtime } = facts;
  if (!account.normalizedEmail || account.userId !== scope.recipientUserId || source.tribeId !== scope.tribeId || source.obligationId !== scope.obligationId
    || source.noticeRecipientUserId !== scope.recipientUserId || source.noticeAudience !== scope.audience || resolveAdmissionNotificationAudience(source.event) !== scope.audience) return null;
  if (scope.audience === ADMISSION_NOTIFICATION_AUDIENCE.applicant ? source.applicantUserId !== account.userId
    : resolveAdmissionNotificationPreference({ tribeId: scope.tribeId, recipientUserId: account.userId, currentRole: account.currentRole, membershipStatus: account.membershipStatus }, null).status !== ADMISSION_NOTIFICATION_PREFERENCE_STATUS.resolved) return null;

  const globalTrusted = facts.globalEvidence.some((evidence) => !evidence.invalidated && evidence.verifiedInPast
    && evidence.userId === account.userId && evidence.accountUserId === account.userId
    && evidence.accountId === evidence.evidenceAccountId && evidence.accountSubject === evidence.evidenceSubject
    && evidence.providerId === GOOGLE_IDENTITY_PROVIDER && evidence.normalizedEmail === account.normalizedEmail
    && (evidence.classification === GOOGLE_EMAIL_AUTHORITY.gmail || evidence.classification === GOOGLE_EMAIL_AUTHORITY.workspace));
  const proof = facts.localProof;
  const localTrusted = scope.audience === ADMISSION_NOTIFICATION_AUDIENCE.applicant && source.evidenceKind === ADMISSION_EVIDENCE_KIND.local
    && source.contactType === ADMISSION_CONTACT_TYPE.email && source.normalizedContact === account.normalizedEmail
    && proof !== null && proof.id === source.proofId && proof.userId === account.userId && proof.tribeId === scope.tribeId
    && proof.appliedRequestId === source.admissionRequestId && proof.contactType === ADMISSION_CONTACT_TYPE.email
    && proof.normalizedContact === account.normalizedEmail && proof.purpose === ADMISSION_VERIFICATION_PURPOSE.admission
    && proof.status === ADMISSION_PROOF_STATUS.applied && !proof.invalidated && proof.verifiedInPast && proof.appliedInPast
    && proof.environment === runtime.environment && proof.securityEpoch === runtime.securityEpoch && proof.resourceSecurityEpoch === runtime.securityEpoch;
  return globalTrusted || localTrusted ? { tribeId: scope.tribeId, obligationId: scope.obligationId, recipientUserId: scope.recipientUserId, audience: scope.audience, normalizedEmail: account.normalizedEmail } : null;
}
