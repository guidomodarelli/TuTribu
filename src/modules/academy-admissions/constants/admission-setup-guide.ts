/** Steps, statuses and copy of the leader's admission setup guide. @module admission-setup-guide */

import { ADMISSION_POLICY_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { MESSAGING_USAGE_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-usage";
import { MESSAGING_CONNECTIONS_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-connections-browser";
import { ADMISSION_NOTIFICATION_SETTINGS_SEGMENT } from "@/src/modules/notifications/constants/admission-notification-settings-page";

/** One setup step, in the order the leader completes them. */
export type AdmissionSetupStepId = "rules" | "connection" | "usage" | "open" | "notifications";
/** Done, still needed, or recommended but not needed for this academy's rules. */
export type AdmissionSetupStepStatus = "done" | "pending" | "optional";

export const ADMISSION_SETUP_STEP = {
  rules: "rules",
  connection: "connection",
  usage: "usage",
  open: "open",
  notifications: "notifications",
} as const satisfies Record<string, AdmissionSetupStepId>;

export const ADMISSION_SETUP_STEP_STATUS = {
  done: "done",
  pending: "pending",
  optional: "optional",
} as const satisfies Record<string, AdmissionSetupStepStatus>;

/** Completion order: messaging is ready before the rules that depend on it are opened. */
export const ADMISSION_SETUP_STEP_ORDER = [
  ADMISSION_SETUP_STEP.rules,
  ADMISSION_SETUP_STEP.connection,
  ADMISSION_SETUP_STEP.usage,
  ADMISSION_SETUP_STEP.open,
  ADMISSION_SETUP_STEP.notifications,
] as const satisfies readonly AdmissionSetupStepId[];

/** Settings page that completes each step, relative to the tribe path. */
export const ADMISSION_SETUP_STEP_SEGMENT = {
  rules: ADMISSION_POLICY_SETTINGS_SEGMENT,
  connection: MESSAGING_CONNECTIONS_SETTINGS_SEGMENT,
  usage: MESSAGING_USAGE_SETTINGS_SEGMENT,
  open: ADMISSION_POLICY_SETTINGS_SEGMENT,
  notifications: ADMISSION_NOTIFICATION_SETTINGS_SEGMENT,
} as const satisfies Record<AdmissionSetupStepId, string>;

/** Visible copy of each step: what it is, what is missing, and the action that completes it. */
export const ADMISSION_SETUP_STEP_COPY = {
  rules: { title: "Definí cómo se admite", pending: "Elegí si revisás cada solicitud o usás una lista de habilitados.", done: "Las reglas están guardadas.", action: "Definir las reglas" },
  connection: { title: "Conectá el envío de mensajes", pending: "Tus reglas envían códigos o avisos: conectá Zavu y activá la conexión.", optional: "Hace falta solo si vas a enviar códigos o avisos por correo.", done: "La conexión está activa.", action: "Conectar mensajería" },
  usage: { title: "Elegí países y cupos", pending: "Indicá a qué países se envía y cuántos mensajes por día.", optional: "Hace falta solo si vas a enviar códigos o avisos por correo.", done: "Los países y cupos están guardados.", action: "Elegir países y cupos" },
  open: { title: "Abrí las admisiones", pending: "Activá las reglas para empezar a recibir solicitudes.", paused: "Las admisiones están pausadas: nadie puede postularse.", done: "Las admisiones están abiertas.", action: "Abrir las admisiones" },
  notifications: { title: "Elegí cómo recibir los avisos", pending: "Activá el correo de la tribu y elegí cada cuánto recibir los avisos.", optional: "Recomendado: así te enterás de cada solicitud nueva.", done: "Recibís los avisos por correo.", action: "Configurar los avisos" },
} as const;

export const ADMISSION_SETUP_GUIDE_COPY = {
  title: "Configurá las admisiones",
  description: "Seguí los pasos en orden. Cada uno se completa en su propia pantalla.",
  listLabel: "Pasos de la configuración",
  progressLabel: "Avance de la configuración",
  optionalBadge: "Opcional",
  doneBadge: "Listo",
  loading: "Cargando la guía de configuración",
} as const;
