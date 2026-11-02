/** Decides whether the notices page needs the messaging connection before its form. @module admission-notification-settings-prerequisite */

import { ADMISSION_SETUP_PREREQUISITE, type AdmissionSetupPrerequisiteId } from "@/src/modules/academy-admissions/constants/admission-setup-prerequisite";
import type { AdmissionNotificationEmailSettingsView } from "../results/admission-notification-settings-result";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";

/** Tribe email facts of the last server read: the leader's email view (null for other reviewers), its platform block and capability. */
export type AdmissionNotificationEmailPrerequisiteFacts = { email: AdmissionNotificationEmailSettingsView | null; platformRequirement: PlatformSecurityRequirement | null; preparedEmailAvailable: boolean | null };

/**
 * Only the leader configures the tribe email, and enabling it is the only change that needs the connection: the write rejects it with
 * `email_capability_unavailable` when no prepared email is available. The read reports that capability only while the email is off and
 * the platform can protect a change, so a guardian, an enabled email or a platform block never get this prerequisite.
 *
 * @param facts - Tribe email facts read on the server (page load or a later current read).
 * @returns The missing prepared email, or `null` when the form can be shown as it is.
 */
export function readAdmissionNotificationEmailPrerequisite(facts: AdmissionNotificationEmailPrerequisiteFacts): AdmissionSetupPrerequisiteId | null {
  const disabledEmail = facts.email?.enabled === false && facts.platformRequirement === null;
  return disabledEmail && facts.preparedEmailAvailable === false ? ADMISSION_SETUP_PREREQUISITE.notificationPreparedEmail : null;
}

