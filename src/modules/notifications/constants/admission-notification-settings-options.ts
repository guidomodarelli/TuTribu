/** Owns the visible choices of a reviewer's personal email preference. @module admission-notification-settings-options */
import { ADMISSION_NOTIFICATION_PREFERENCE_MODE } from "./admission-notification-preference";

/** Preserves grouped, individual, daily and omitted delivery semantics and ordering. */
export const ADMISSION_NOTIFICATION_PREFERENCE_OPTIONS = [
  { value: ADMISSION_NOTIFICATION_PREFERENCE_MODE.grouped, label: "Agrupar cada cinco minutos" },
  { value: ADMISSION_NOTIFICATION_PREFERENCE_MODE.individual, label: "Un correo por aviso" },
  { value: ADMISSION_NOTIFICATION_PREFERENCE_MODE.daily, label: "Resumen diario" },
  { value: ADMISSION_NOTIFICATION_PREFERENCE_MODE.omitted, label: "Omitir correos de revisión" },
] as const;
