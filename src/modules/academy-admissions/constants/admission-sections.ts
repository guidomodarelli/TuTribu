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

/** Copy of the shared workspace frame. */
export const ADMISSION_WORKSPACE_COPY = {
  eyebrow: "Admisiones",
  navigation: "Secciones de admisión",
  related: "Acciones relacionadas",
  backToManagement: "Gestionar academia",
} as const;

/** Return destination of the workspace frame: academy management, which leaders and guardians both open from the app rail. */
export const ADMISSION_WORKSPACE_RETURN = { label: ADMISSION_WORKSPACE_COPY.backToManagement, href: ROUTES.tribes.academyManage } as const;
