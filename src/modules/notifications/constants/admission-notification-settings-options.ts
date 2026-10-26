/** Owns the visible choices and summaries of a reviewer's personal email preference. @module admission-notification-settings-options */
import type { AdmissionNotificationPreferenceMode } from "../domain/entities/admission-notification-preference";
import { ADMISSION_NOTIFICATION_PREFERENCE_MODE } from "./admission-notification-preference";
import type { AdmissionNotificationSettingsEmailPlan } from "./admission-notification-settings-browser";

/** The choice preselected when the person has no saved preference yet. */
export const ADMISSION_NOTIFICATION_RECOMMENDED_MODE: AdmissionNotificationPreferenceMode = ADMISSION_NOTIFICATION_PREFERENCE_MODE.grouped;

/** Preserves grouped, individual, daily and omitted delivery semantics and ordering, recommended choice first. */
export const ADMISSION_NOTIFICATION_PREFERENCE_OPTIONS = [
  { value: ADMISSION_NOTIFICATION_PREFERENCE_MODE.grouped, label: "Agrupar cada cinco minutos", description: "Recomendado. Un correo con todo lo nuevo de cada cinco minutos." },
  { value: ADMISSION_NOTIFICATION_PREFERENCE_MODE.individual, label: "Un correo por aviso", description: "Un correo apenas llega algo para revisar." },
  { value: ADMISSION_NOTIFICATION_PREFERENCE_MODE.daily, label: "Resumen diario", description: "Un solo correo a las 09:00, en la zona horaria de la tribu." },
  { value: ADMISSION_NOTIFICATION_PREFERENCE_MODE.omitted, label: "Omitir correos de revisión", description: "No recibís correos; los avisos dentro de TuTribu se mantienen." },
] as const satisfies readonly { value: AdmissionNotificationPreferenceMode; label: string; description: string }[];

/** One sentence that tells the person what they receive with each saved choice. */
export const ADMISSION_NOTIFICATION_PREFERENCE_SUMMARY = {
  [ADMISSION_NOTIFICATION_PREFERENCE_MODE.grouped]: "Recibís avisos agrupados cada cinco minutos en tu correo.",
  [ADMISSION_NOTIFICATION_PREFERENCE_MODE.individual]: "Recibís un correo por cada aviso de revisión.",
  [ADMISSION_NOTIFICATION_PREFERENCE_MODE.daily]: "Recibís un resumen diario a las 09:00, en la zona horaria de la tribu.",
  [ADMISSION_NOTIFICATION_PREFERENCE_MODE.omitted]: "No recibís correos de revisión porque elegiste omitirlos.",
} satisfies Record<AdmissionNotificationPreferenceMode, string>;

/** Marker of the tribe email row in the review step. */
export const ADMISSION_NOTIFICATION_EMAIL_PLAN_LABEL = {
  unchanged: "Sin cambios",
  save: "Se guarda",
  retry: "Se reintenta el cambio pendiente",
  blocked: "Pendiente de confirmar",
} satisfies Record<AdmissionNotificationSettingsEmailPlan, string>;

/** Marker of the personal frequency row in the review step. */
export const ADMISSION_NOTIFICATION_PREFERENCE_PLAN_LABEL = { changed: "Se guarda", unchanged: "Sin cambios" } as const;

/** Help of the tribe time zone field; read as plain text, so the 09:00 summary time is announced whole. */
export const ADMISSION_NOTIFICATION_TIME_ZONE_HELP = "Se usa para el resumen diario de las 09:00. Por ejemplo, America/Argentina/Buenos_Aires.";
