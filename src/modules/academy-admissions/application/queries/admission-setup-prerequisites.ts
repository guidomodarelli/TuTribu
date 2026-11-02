/**
 * Derives what an admission form needs from another tab, from facts its page read on the server. Each rule mirrors a rejection the
 * writer applies, so hiding the form never disagrees with the save; the server still checks every write. @module admission-setup-prerequisites
 */

import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";
import { ADMISSION_SETUP_PREREQUISITE, type AdmissionSetupPrerequisiteId } from "@/src/modules/academy-admissions/constants/admission-setup-prerequisite";
import type { AdmissionContactType } from "@/src/modules/academy-admissions/domain/value-objects/admission-contact";

/** Rules facts the invitations page reads: the saved contact type (null without rules) and whether a code checks it. */
export type PersonalInvitationIssueFacts = { contactType: AdmissionContactType | null; requiresAdditionalVerification: boolean };

/**
 * Issuing takes the contact type of the saved rules (`resource_unavailable` without them), and rules that ask for a phone without a
 * code issue no personal invitation (`invitation_unavailable`).
 *
 * @param facts - Rules facts of the current invitations page read.
 * @returns What blocks issuing a new personal invitation, or `null` when the rules allow it.
 */
export function readPersonalInvitationIssuePrerequisite(facts: PersonalInvitationIssueFacts): AdmissionSetupPrerequisiteId | null {
  if (facts.contactType === null) return ADMISSION_SETUP_PREREQUISITE.invitationRules;
  return facts.contactType === ADMISSION_CONTACT_TYPE.phone && !facts.requiresAdditionalVerification ? ADMISSION_SETUP_PREREQUISITE.invitationPhoneVerification : null;
}
