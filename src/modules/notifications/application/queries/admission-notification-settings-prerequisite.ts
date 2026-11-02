/** Decides whether the notices page needs the messaging connection before its form. @module admission-notification-settings-prerequisite */

import { ADMISSION_SETUP_PREREQUISITE, type AdmissionSetupPrerequisiteId } from "@/src/modules/academy-admissions/constants/admission-setup-prerequisite";
import type { AdmissionNotificationSettingsPageState } from "../results/admission-notification-settings-page-state";
import type { AdmissionNotificationEmailSettingsView } from "../results/admission-notification-settings-result";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import { ADMISSION_NOTIFICATION_SETTINGS_PAGE_KIND } from "../../constants/admission-notification-settings-page";

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

/**
 * @param state - Current guarded notices page state, read on the server.
 * @returns The missing prepared email, or `null` for an unreadable state or a form that can be shown as it is.
 */
export function readAdmissionNotificationSettingsPrerequisite(state: AdmissionNotificationSettingsPageState): AdmissionSetupPrerequisiteId | null {
  return state.kind === ADMISSION_NOTIFICATION_SETTINGS_PAGE_KIND.ready ? readAdmissionNotificationEmailPrerequisite(state) : null;
}
