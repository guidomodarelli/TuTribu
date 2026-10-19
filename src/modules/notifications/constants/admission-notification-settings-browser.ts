/** Owns settings workflow vocabulary and safe Spanish feedback without encoding provider messages. @module admission-notification-settings-browser-constants */
import type { AdmissionNotificationEmailSettingsRejectionReason } from "../domain/entities/admission-notification-email-settings";
import { ADMISSION_EMAIL_SETTINGS_REJECTION } from "./admission-notification-email-settings";

/** Distinguishes cancellable reads, explicit writes and uncertainty requiring original recovery. */
export const ADMISSION_NOTIFICATION_SETTINGS_PHASE = { checking: "checking", reading: "reading", writing: "writing", idle: "idle", uncertain: "uncertain", changedViewer: "changed_viewer" } as const;
/** Copy follows the repository's existing Spanish workflow catalogue convention. */
export const ADMISSION_NOTIFICATION_SETTINGS_COPY = {
  checking: "Consultando la cuenta y los ajustes actuales…",
  changedViewer: "La cuenta cambió. Volvé a cargar la página antes de continuar.",
  storageFailed: "No pudimos conservar el cambio en este navegador. Consultá el estado antes de continuar.",
  uncertain: "Todavía no confirmamos el resultado. Consultá el cambio original antes de iniciar otro.",
  originalAbsent: "El cambio original todavía no aparece registrado. Podés volver a consultarlo o reintentarlo con la misma referencia y una nueva confirmación.",
  originalStarted: "El cambio sigue pendiente. Podés consultarlo o reintentar el original con una confirmación nueva.",
  recovered: "Recuperamos el resultado del cambio original. Los ajustes actuales se consultaron por separado.",
  preferenceSaved: "Tu preferencia quedó guardada.",
  preferenceUnchanged: "Tu preferencia ya estaba guardada.",
  preferenceConflict: "Tu preferencia cambió en otra ventana. Consultá el estado actual y confirmá tu elección nuevamente.",
  preferenceUncertain: "No confirmamos si se guardó tu preferencia. Consultá el estado actual antes de volver a guardar.",
  emailSaved: "La configuración del correo quedó guardada.",
  emailUnchanged: "La configuración del correo ya estaba guardada.",
  invalid: "Revisá la zona horaria y marcá la confirmación antes de guardar.",
} as const;
/** Terminal business rejections never announce a save or copy a provider diagnostic. */
export const ADMISSION_NOTIFICATION_SETTINGS_REJECTION_COPY = {
  [ADMISSION_EMAIL_SETTINGS_REJECTION.versionConflict]: "La configuración cambió en otra ventana. Consultá el estado actual antes de volver a confirmar.",
  [ADMISSION_EMAIL_SETTINGS_REJECTION.capabilityUnavailable]: "Falta un correo preparado para habilitar los avisos. Revisá la conexión de mensajería y su comprobación.",
  [ADMISSION_EMAIL_SETTINGS_REJECTION.scopeMismatch]: "El cambio no coincide con la tribu actual. Volvé a consultar los ajustes.",
} satisfies Record<AdmissionNotificationEmailSettingsRejectionReason, string>;
