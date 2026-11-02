/**
 * Configuration an admission tab needs from another tab before its form can be saved, the tab that resolves it and its copy.
 * Each entry mirrors a rejection the server already applies on write; the screen only shows it earlier. @module admission-setup-prerequisite
 */

import { ADMISSION_POLICY_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { MESSAGING_CONNECTIONS_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-connections-browser";

/**
 * One missing prerequisite, named by the form it blocks:
 * - `allowlist_rules`: list entries take the contact type of the saved rules (no rules: `resource_unavailable`).
 * - `allowlist_import_rules`: the same for a CSV import.
 * - `invitation_rules`: a personal invitation takes the contact type of the saved rules (no rules: `resource_unavailable`).
 * - `invitation_phone_verification`: rules with a phone contact and no code issue no personal invitation (`invitation_unavailable`).
 * - `notification_prepared_email`: enabling the tribe email needs a prepared, tested email (`email_capability_unavailable`).
 */
export type AdmissionSetupPrerequisiteId = "allowlist_rules" | "allowlist_import_rules" | "invitation_rules" | "invitation_phone_verification" | "notification_prepared_email";

export const ADMISSION_SETUP_PREREQUISITE = {
  allowlistRules: "allowlist_rules",
  allowlistImportRules: "allowlist_import_rules",
  invitationRules: "invitation_rules",
  invitationPhoneVerification: "invitation_phone_verification",
  notificationPreparedEmail: "notification_prepared_email",
} as const satisfies Record<string, AdmissionSetupPrerequisiteId>;

/** Tab that resolves each prerequisite, relative to the tribe path. */
const ADMISSION_SETUP_PREREQUISITE_SEGMENT = {
  allowlist_rules: ADMISSION_POLICY_SETTINGS_SEGMENT,
  allowlist_import_rules: ADMISSION_POLICY_SETTINGS_SEGMENT,
  invitation_rules: ADMISSION_POLICY_SETTINGS_SEGMENT,
  invitation_phone_verification: ADMISSION_POLICY_SETTINGS_SEGMENT,
  notification_prepared_email: MESSAGING_CONNECTIONS_SETTINGS_SEGMENT,
} as const satisfies Record<AdmissionSetupPrerequisiteId, string>;

/** What is missing (title), why this tab needs it (one line) and the action that opens the tab that resolves it. */
export const ADMISSION_SETUP_PREREQUISITE_COPY = {
  allowlist_rules: {
    title: "Primero guardá las reglas de admisión",
    reason: "La lista usa el tipo de contacto de las reglas de admisión. Guardalas primero y después agregá contactos.",
    action: "Ir a Reglas",
  },
  allowlist_import_rules: {
    title: "Primero guardá las reglas de admisión",
    reason: "La importación usa el tipo de contacto de las reglas de admisión. Guardalas primero y después importá el CSV.",
    action: "Ir a Reglas",
  },
  invitation_rules: {
    title: "Primero guardá las reglas de admisión",
    reason: "Cada invitación usa el tipo de contacto de las reglas de admisión. Guardalas primero y después emití invitaciones.",
    action: "Ir a Reglas",
  },
  invitation_phone_verification: {
    title: "Primero activá la comprobación del teléfono con un código",
    reason: "Tus reglas piden un teléfono sin comprobarlo con un código, y así no se emiten invitaciones personales.",
    action: "Ir a Reglas",
  },
  notification_prepared_email: {
    title: "Primero conectá el envío de mensajes",
    reason: "Para habilitar el correo de la tribu hace falta un correo preparado y probado en la conexión de mensajería.",
    action: "Ir a Conexión",
  },
} as const satisfies Record<AdmissionSetupPrerequisiteId, { title: string; reason: string; action: string }>;

/** @param slug - Tribe slug. @param prerequisite - Missing prerequisite. @returns The page of the tab that resolves it. */
export function admissionSetupPrerequisiteHref(slug: string, prerequisite: AdmissionSetupPrerequisiteId): string {
  return `/${encodeURIComponent(slug)}/${ADMISSION_SETUP_PREREQUISITE_SEGMENT[prerequisite]}`;
}
