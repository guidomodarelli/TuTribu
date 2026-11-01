/** Steps, statuses and copy of the leader's admission setup guide. @module admission-setup-guide */

import { ADMISSION_POLICY_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { MESSAGING_USAGE_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-usage";
import { MESSAGING_CONNECTIONS_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-connections-browser";
import { ADMISSION_NOTIFICATION_SETTINGS_SEGMENT } from "@/src/modules/notifications/constants/admission-notification-settings-page";
import { ADMISSION_POLICY_ENTRY_STEP, type AdmissionPolicyEntryStep } from "@/src/modules/academy-admissions/constants/admission-policy-flow";

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

/** Rules step opened directly by a guide link: publishing a draft goes to the final step. */
export const ADMISSION_SETUP_STEP_POLICY_ENTRY = { open: ADMISSION_POLICY_ENTRY_STEP.review } as const satisfies Partial<Record<AdmissionSetupStepId, AdmissionPolicyEntryStep>>;

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
  usage: { title: "Elegí países y cupos", pending: "Indicá a qué países se envía y cuántos mensajes por día.", optional: "Hace falta solo si vas a enviar códigos o avisos por correo.", done: "Los países y cupos están guardados.", lowQuota: "Los países y cupos están guardados, pero el cupo de avisos por día es menor a 20: en un día con varias solicitudes, los avisos siguientes no se envían hasta el día siguiente.", action: "Elegir países y cupos" },
  open: { title: "Abrí las admisiones", pending: "Activá las reglas para empezar a recibir solicitudes.", paused: "Las admisiones están pausadas: nadie puede postularse.", platformBlocked: "Depende del equipo de TuTribu: la plataforma todavía no permite activar las admisiones de esta academia. Lo que guardaste queda como borrador.", platformBlockedUnsaved: "Depende del equipo de TuTribu: la plataforma todavía no permite activar las admisiones de esta academia.", admissionsClosed: "Las admisiones de la academia están cerradas. Encendé «Admisiones abiertas» en Gestionar academia y después activá las reglas.", academyAction: "Ir a Gestionar academia", done: "Las admisiones están abiertas.", action: "Abrir las admisiones" },
  notifications: { title: "Elegí cómo recibir los avisos", pending: "Activá el correo de la tribu y elegí cada cuánto recibir los avisos.", optional: "Recomendado: así te enterás de cada solicitud nueva.", omitted: "El correo de la tribu está habilitado, pero elegiste «Omitir correos de revisión»: no vas a recibir correos de las solicitudes nuevas.", done: "Recibís los avisos por correo.", action: "Configurar los avisos" },
} as const;

export const ADMISSION_SETUP_GUIDE_COPY = {
  title: "Configurá las admisiones",
  description: "Seguí los pasos en orden. Cada uno se completa en su propia pantalla.",
  listLabel: "Pasos de la configuración",
  progressLabel: "Avance de la configuración",
  optionalBadge: "Opcional",
  doneBadge: "Listo",
  draftBadge: "Borrador sin publicar",
  platformBadge: "Depende del equipo de TuTribu",
  admissionsClosedBadge: "Admisiones cerradas",
  lowQuotaBadge: "Listo, pero con un cupo muy bajo",
  emailOmittedBadge: "No recibís correos",
  loading: "Cargando la guía de configuración",
} as const;

/**
 * What the single platform notice of the guide says stays unavailable while no admission write can be protected: no step offers
 * its page, and a draft is mentioned only when rules were actually saved.
 */
export const ADMISSION_SETUP_PLATFORM_COPY = {
  unsaved: "Todavía no se puede configurar ni guardar nada de las admisiones: ni las reglas, ni la mensajería, ni los cupos. Esto no es algo que puedas resolver desde tu academia.",
  saved: "Todavía no se puede cambiar ni guardar nada de las admisiones; lo que ya guardaste se conserva. Esto no es algo que puedas resolver desde tu academia.",
} as const;
