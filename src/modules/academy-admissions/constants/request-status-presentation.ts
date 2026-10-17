/** Owns request-state display copy separately from initial admission instructions. @module request-status-presentation */
import { ADMISSION_UI_COPY } from "./admission-ui";

/** Displays the stored status without converting a derived expiry reason into a persisted terminal state. */
export const ADMISSION_REQUEST_STATUS_COPY = { pending: ADMISSION_UI_COPY.pending, approved: ADMISSION_UI_COPY.approved, rejected: ADMISSION_UI_COPY.rejected, cancelled: ADMISSION_UI_COPY.cancelled, expired: ADMISSION_UI_COPY.expired } satisfies Record<"pending" | "approved" | "rejected" | "cancelled" | "expired", string>;

/** Explains a corrective action on the already submitted request, without implying another submission. */
export const ADMISSION_REQUEST_REVERIFICATION_COPY = {
  required: "Necesitás comprobar el contacto de esta solicitud pendiente para que puedan aprobarla.",
  revoked: "La prueba de contacto de esta solicitud fue revocada. Necesitás comprobar el contacto nuevamente para que puedan aprobarla.",
} as const;

/** Explains current nonterminal restrictions without exposing reviewer notes or account/provider identifiers. */
export const ADMISSION_REQUEST_ELIGIBILITY_COPY: Readonly<Record<string, string | undefined>> = {
  whatsapp_number_required: "Completá el número de WhatsApp que usás en el grupo para que puedan revisar y aprobar tu solicitud.",
  admission_closed: "Por ahora esta solicitud no puede aprobarse porque las admisiones no están disponibles. Su plazo sigue corriendo.",
  admission_scope_mismatch: "No se puede confirmar la elegibilidad actual de esta solicitud. Volvé a consultar con tu cuenta o contactá al equipo de la academia.",
  contact_account_mismatch: "El contacto de esta solicitud no coincide con tu cuenta actual. Consultá al equipo de la academia antes de continuar.",
  contact_type_mismatch: "El tipo de contacto de esta solicitud no coincide con la configuración actual. Consultá al equipo de la academia.",
  contact_conflict: "El contacto de esta solicitud tiene una vinculación que impide aprobarla. Consultá al equipo de la academia.",
  allowlist_requirement_unmet: "Actualmente no se cumple la lista exigida para esta solicitud. Consultá al equipo de la academia.",
  invitation_unusable: "La autorización de la invitación de esta solicitud ya no está disponible. Consultá al equipo de la academia.",
  invitation_recipient_unproven: "El contacto de esta invitación necesita una comprobación vigente antes de que puedan aprobarla.",
  phone_invitation_unavailable: "La invitación por teléfono necesita una comprobación de contacto habilitada. Consultá al equipo de la academia.",
  membership_restricted: "Tu pertenencia actual impide aprobar esta solicitud. Consultá al equipo de la academia.",
  membership_recovery_unknown: "El equipo de la academia necesita revisar tu pertenencia antes de aprobar esta solicitud.",
};
