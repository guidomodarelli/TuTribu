/** Chooses, from the server-read page state, between the notices form and the prerequisite it still needs. @module admission-notification-settings-gate */
import { AdmissionSetupPrerequisite } from "@/components/academy-admissions/admission-setup-prerequisite";
import { admissionSetupPrerequisiteHref } from "@/src/modules/academy-admissions/constants/admission-setup-prerequisite";
import { readAdmissionNotificationSettingsPrerequisite } from "@/src/modules/notifications/application/queries/admission-notification-settings-prerequisite";
import type { AdmissionNotificationSettingsPageState } from "@/src/modules/notifications/application/results/admission-notification-settings-page-state";
import type { AdmissionNotificationSettingsBrowserClient } from "@/src/modules/notifications/application/ports/admission-notification-settings-browser-client";
import { ADMISSION_NOTIFICATION_SETTINGS_PAGE_KIND as PAGE_KIND } from "@/src/modules/notifications/constants/admission-notification-settings-page";
import { AdmissionNotificationSettingsContainer } from "./notification-settings-container";

/**
 * A leader whose tribe email cannot be enabled yet (the connection has no prepared email) sees that prerequisite and its link to
 * Conexión instead of a form whose save would be rejected. The gate is recomputed by the server on every visit and is only guidance:
 * the email write checks the same capability again. Guardians and unreadable states keep the screen as it was.
 *
 * @param props - Guarded server page state and optional owned browser port for the form.
 * @returns The prerequisite state, or the notices form.
 */
export function AdmissionNotificationSettingsGate({ initialState, client }: { initialState: AdmissionNotificationSettingsPageState; client?: AdmissionNotificationSettingsBrowserClient }) {
  const prerequisite = readAdmissionNotificationSettingsPrerequisite(initialState);
  if (prerequisite && initialState.kind === PAGE_KIND.ready) return <AdmissionSetupPrerequisite prerequisite={prerequisite} href={admissionSetupPrerequisiteHref(initialState.slug, prerequisite)} />;
  const key = initialState.kind === PAGE_KIND.ready ? `${initialState.slug}:${initialState.viewerId}` : initialState.code;
  return <AdmissionNotificationSettingsContainer key={key} initialState={initialState} client={client} />;
}
