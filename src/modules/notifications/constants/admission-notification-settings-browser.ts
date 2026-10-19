/** Owns settings workflow vocabulary and safe Spanish feedback without encoding provider messages. @module admission-notification-settings-browser-constants */
import type { AdmissionNotificationEmailSettingsRejectionReason } from "../domain/entities/admission-notification-email-settings";
import { ADMISSION_EMAIL_SETTINGS_REJECTION } from "./admission-notification-email-settings";

/** Distinguishes cancellable reads, explicit writes and uncertainty requiring original recovery. */
export const ADMISSION_NOTIFICATION_SETTINGS_PHASE = { checking: "checking", reading: "reading", writing: "writing", idle: "idle", uncertain: "uncertain", changedViewer: "changed_viewer" } as const;

/** The write currently in flight inside one chained save; each one is announced separately. */
export type AdmissionNotificationSettingsSaveStep = "email" | "preference";
/** Chained saves always write the tribe email before the personal preference. */
export const ADMISSION_NOTIFICATION_SETTINGS_SAVE_STEP = { email: "email", preference: "preference" } as const satisfies Record<string, AdmissionNotificationSettingsSaveStep>;

/** What the final save does with the tribe email: nothing, a new command, the original command again, or nothing until a read. */
export type AdmissionNotificationSettingsEmailPlan = "unchanged" | "save" | "retry" | "blocked";
/** Names each email outcome of the review step. */
export const ADMISSION_NOTIFICATION_SETTINGS_EMAIL_PLAN = { unchanged: "unchanged", save: "save", retry: "retry", blocked: "blocked" } as const satisfies Record<string, AdmissionNotificationSettingsEmailPlan>;

/** Stable keys of the leader's guided steps. */
export type AdmissionNotificationSettingsGuidedStep = "tribe-email" | "frequency" | "review";
/** Names each guided step of the leader. */
export const ADMISSION_NOTIFICATION_SETTINGS_GUIDED_STEP = { tribeEmail: "tribe-email", frequency: "frequency", review: "review" } as const satisfies Record<string, AdmissionNotificationSettingsGuidedStep>;
/** Order of the leader's steps; the container resumes a pending original on the review step. */
export const ADMISSION_NOTIFICATION_SETTINGS_LEADER_STEP_ORDER: readonly AdmissionNotificationSettingsGuidedStep[] = [ADMISSION_NOTIFICATION_SETTINGS_GUIDED_STEP.tribeEmail, ADMISSION_NOTIFICATION_SETTINGS_GUIDED_STEP.frequency, ADMISSION_NOTIFICATION_SETTINGS_GUIDED_STEP.review];

/** Copy follows the repository's existing Spanish workflow catalogue convention. */
export const ADMISSION_NOTIFICATION_SETTINGS_COPY = {
  checking: "Consultando la cuenta y los ajustes actuales…",
  changedViewer: "La cuenta cambió. Volvé a cargar la página antes de continuar.",
  storageFailed: "No pudimos conservar el cambio en este navegador. Consultá el estado antes de continuar.",
  uncertain: "Todavía no confirmamos el resultado. Consultá el cambio original antes de iniciar otro.",
  originalAbsent: "El cambio original todavía no aparece registrado. Podés volver a consultarlo o reintentarlo con la misma referencia y una nueva confirmación.",
  originalStarted: "El cambio sigue pendiente. Podés consultarlo o reintentar el original con una confirmación nueva.",
  recovered: "Recuperamos el resultado del cambio original. Los ajustes actuales se consultaron por separado.",
  preferenceConflict: "Tu preferencia cambió en otra ventana. Consultá el estado actual y confirmá tu elección nuevamente.",
  preferenceUncertain: "No confirmamos si se guardó tu preferencia. Consultá el estado actual antes de volver a guardar.",
  invalid: "Revisá la zona horaria y marcá la confirmación antes de guardar.",
  savingEmail: "Guardando el correo de la tribu…",
  savingPreference: "Guardando tu preferencia…",
  saved: "Tus avisos quedaron guardados.",
  preferencePending: "Tu preferencia todavía no se guardó.",
  emailSavedPreferencePending: "El correo de la tribu quedó guardado. Falta guardar tu preferencia.",
  staleRead: "Consultá el estado actual antes de guardar otro cambio.",
  noChanges: "No hay cambios para guardar.",
  confirmRequired: "Marcá la confirmación para guardar.",
  zoneRequired: "Indicá una zona horaria para continuar.",
  emailOriginalBlocked: "El cambio anterior del correo de la tribu sigue sin confirmar. Consultá el estado actual antes de guardar.",
} as const;
/** Terminal business rejections never announce a save or copy a provider diagnostic. */
export const ADMISSION_NOTIFICATION_SETTINGS_REJECTION_COPY = {
  [ADMISSION_EMAIL_SETTINGS_REJECTION.versionConflict]: "La configuración cambió en otra ventana. Consultá el estado actual antes de volver a confirmar.",
  [ADMISSION_EMAIL_SETTINGS_REJECTION.capabilityUnavailable]: "Falta un correo preparado para habilitar los avisos. Revisá la conexión de mensajería y su comprobación.",
  [ADMISSION_EMAIL_SETTINGS_REJECTION.scopeMismatch]: "El cambio no coincide con la tribu actual. Volvé a consultar los ajustes.",
} satisfies Record<AdmissionNotificationEmailSettingsRejectionReason, string>;
