/** Shared section map for the admission workspace navigation: every admission and messaging setup page links to its siblings. @module admission-sections */
import { ADMISSION_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-navigation";
import { ADMISSION_POLICY_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { ALLOWLIST_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/allowlist-browser";
import { PERSONAL_INVITATION_MANAGEMENT_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/personal-invitation-management-page";
import { ADMISSION_ACTIVITY_BROWSER_PATH } from "@/src/modules/academy-admissions/constants/admission-activity-browser";
import { MESSAGING_USAGE_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-usage";
import { MESSAGING_CONNECTIONS_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-connections-browser";
import { ADMISSION_NOTIFICATION_SETTINGS_SEGMENT } from "@/src/modules/notifications/constants/admission-notification-settings-page";
import { ROUTES } from "@/src/constants/routes";
import { ALLOWLIST_IMPORT_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/allowlist-import-browser";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";
import { ADMISSION_REVIEW_HISTORY_COPY } from "@/src/modules/academy-admissions/constants/admission-review-history-page";

/** One admission workspace destination. */
export type AdmissionSection = "review" | "policy" | "allowlist" | "invitations" | "usage" | "connections" | "notifications" | "activity";

/** Who may open a destination: reviewers (leader or guardian) or only the active leader. */
export type AdmissionSectionAudience = "reviewer" | "leader";

/** Destination keys, so pages name their section without repeating string literals. */
export const ADMISSION_SECTION = {
  review: "review",
  policy: "policy",
  allowlist: "allowlist",
  invitations: "invitations",
  usage: "usage",
  connections: "connections",
  notifications: "notifications",
  activity: "activity",
} as const satisfies Record<AdmissionSection, AdmissionSection>;

/** Audience keys used by the workspace shell. */
export const ADMISSION_SECTION_AUDIENCE = { reviewer: "reviewer", leader: "leader" } as const satisfies Record<AdmissionSectionAudience, AdmissionSectionAudience>;

/** Navigation order, labels, route segments and minimum audience of each destination. */
export const ADMISSION_SECTIONS = [
  { section: ADMISSION_SECTION.review, label: "Solicitudes", segment: ADMISSION_NAVIGATION.reviewSegment, audience: ADMISSION_SECTION_AUDIENCE.reviewer },
  { section: ADMISSION_SECTION.policy, label: "Reglas", segment: ADMISSION_POLICY_SETTINGS_SEGMENT, audience: ADMISSION_SECTION_AUDIENCE.leader },
  { section: ADMISSION_SECTION.allowlist, label: "Habilitados", segment: ALLOWLIST_SETTINGS_SEGMENT, audience: ADMISSION_SECTION_AUDIENCE.leader },
  { section: ADMISSION_SECTION.invitations, label: "Invitaciones", segment: PERSONAL_INVITATION_MANAGEMENT_SETTINGS_SEGMENT, audience: ADMISSION_SECTION_AUDIENCE.leader },
  { section: ADMISSION_SECTION.usage, label: "Países y cupos", segment: MESSAGING_USAGE_SETTINGS_SEGMENT, audience: ADMISSION_SECTION_AUDIENCE.leader },
  { section: ADMISSION_SECTION.connections, label: "Conexión", segment: MESSAGING_CONNECTIONS_SETTINGS_SEGMENT, audience: ADMISSION_SECTION_AUDIENCE.leader },
  { section: ADMISSION_SECTION.notifications, label: "Avisos", segment: ADMISSION_NOTIFICATION_SETTINGS_SEGMENT, audience: ADMISSION_SECTION_AUDIENCE.reviewer },
  { section: ADMISSION_SECTION.activity, label: "Actividad", segment: ADMISSION_ACTIVITY_BROWSER_PATH.settings, audience: ADMISSION_SECTION_AUDIENCE.leader },
] as const satisfies readonly { section: AdmissionSection; label: string; segment: string; audience: AdmissionSectionAudience }[];

/** One admission page: the review history and the CSV import are pages of their own inside a section. */
export type AdmissionPage = "review" | "history" | "policy" | "allowlist" | "allowlistImport" | "invitations" | "usage" | "connections" | "notifications" | "activity";

/** Heading, description, loading announcement, section and route of each admission page, read by the shared layout and the loading skeletons. */
export const ADMISSION_PAGES = {
  review: { section: ADMISSION_SECTION.review, segment: ADMISSION_NAVIGATION.reviewSegment, title: ADMISSION_REVIEW_UI_COPY.title, description: ADMISSION_REVIEW_UI_COPY.description, loading: "Cargando las solicitudes…" },
  history: { section: ADMISSION_SECTION.review, segment: `${ADMISSION_NAVIGATION.reviewSegment}/history`, title: ADMISSION_REVIEW_HISTORY_COPY.title, description: ADMISSION_REVIEW_HISTORY_COPY.description, loading: "Cargando el historial…" },
  policy: { section: ADMISSION_SECTION.policy, segment: ADMISSION_POLICY_SETTINGS_SEGMENT, title: "Reglas de admisión", description: "Prepará las reglas de ingreso y revisá su impacto antes de confirmar.", loading: "Cargando las reglas…" },
  allowlist: { section: ADMISSION_SECTION.allowlist, segment: ALLOWLIST_SETTINGS_SEGMENT, title: "Lista de habilitados", description: "Contactos que pueden ingresar según las reglas de admisión. Cambiar la lista no crea ni quita membresías.", loading: "Cargando la lista…" },
  allowlistImport: { section: ADMISSION_SECTION.allowlist, segment: ALLOWLIST_IMPORT_SETTINGS_SEGMENT, title: "Importar habilitados desde CSV", description: "Revisá el archivo en una vista previa y elegí qué filas incorporar a la lista.", loading: "Cargando la importación…" },
  invitations: { section: ADMISSION_SECTION.invitations, segment: PERSONAL_INVITATION_MANAGEMENT_SETTINGS_SEGMENT, title: "Invitaciones personales", description: "Emití, renombrá o revocá enlaces de ingreso para una persona en particular.", loading: "Cargando las invitaciones…" },
  usage: { section: ADMISSION_SECTION.usage, segment: MESSAGING_USAGE_SETTINGS_SEGMENT, title: "Países y cupos de mensajería", description: "Prepará el uso antes de conectar un canal o solicitar una prueba telefónica.", loading: "Cargando países y cupos…" },
  connections: { section: ADMISSION_SECTION.connections, segment: MESSAGING_CONNECTIONS_SETTINGS_SEGMENT, title: "Conexión de mensajería", description: "Conectá Zavu, prepará los canales, probalos y activá la conexión de tu academia.", loading: "Cargando la conexión…" },
  notifications: { section: ADMISSION_SECTION.notifications, segment: ADMISSION_NOTIFICATION_SETTINGS_SEGMENT, title: "Avisos de admisión", description: "Elegí cómo recibir los avisos de nuevas solicitudes.", loading: "Cargando los avisos…" },
  activity: { section: ADMISSION_SECTION.activity, segment: ADMISSION_ACTIVITY_BROWSER_PATH.settings, title: "Consumo e historial de admisión", description: "Consumo de mensajería, métricas de solicitudes y hechos registrados de esta academia.", loading: "Cargando consumo e historial…" },
} as const satisfies Record<AdmissionPage, { section: AdmissionSection; segment: string; title: string; description: string; loading: string }>;

/** Copy of the shared workspace frame. */
export const ADMISSION_WORKSPACE_COPY = {
  eyebrow: "Admisiones",
  navigation: "Secciones de admisión",
  related: "Acciones relacionadas",
  backToManagement: "Gestionar academia",
} as const;

/** Return destination of the workspace frame: academy management, which leaders and guardians both open from the app rail. */
export const ADMISSION_WORKSPACE_RETURN = { label: ADMISSION_WORKSPACE_COPY.backToManagement, href: ROUTES.tribes.academyManage } as const;
