/**
 * Owns the stored admission notice audiences and event-derived type namespace.
 * Public inbox types are introduced with their reader and presentation contract.
 *
 * @module admission-notifications
 */

/** Distinguishes personal preadmission state from currently authorized review work. */
export const ADMISSION_NOTIFICATION_AUDIENCE = {
  applicant: "applicant",
  reviewer: "reviewer",
} as const;

/** Mirrors the original obligation event without storing review notes or contact data. */
export const ADMISSION_NOTIFICATION_TYPE = {
  pendingCreated: "admission_pending_created",
  approved: "admission_approved",
  rejected: "admission_rejected",
  cancelled: "admission_cancelled",
  expired: "admission_expired",
  reminder: "admission_reminder",
} as const;

/** Stored notice types reserved for the obligation-backed visibility contract. */
export const ADMISSION_NOTIFICATION_TYPES = Object.values(ADMISSION_NOTIFICATION_TYPE);

/** Safe Spanish original-event copy, without echoing contact, applicant text or review notes. */
export const ADMISSION_NOTIFICATION_COPY = {
  applicant: {
    [ADMISSION_NOTIFICATION_TYPE.pendingCreated]: "Solicitud de ingreso enviada",
    [ADMISSION_NOTIFICATION_TYPE.approved]: "Tu ingreso fue aprobado",
    [ADMISSION_NOTIFICATION_TYPE.rejected]: "Tu solicitud de ingreso no fue aprobada",
    [ADMISSION_NOTIFICATION_TYPE.cancelled]: "Tu solicitud de ingreso fue cancelada",
    [ADMISSION_NOTIFICATION_TYPE.expired]: "Tu solicitud de ingreso venció",
    [ADMISSION_NOTIFICATION_TYPE.reminder]: "Tu solicitud de ingreso sigue pendiente",
  },
  reviewer: {
    [ADMISSION_NOTIFICATION_TYPE.pendingCreated]: "Nueva solicitud de ingreso",
    [ADMISSION_NOTIFICATION_TYPE.approved]: "Se aprobó una solicitud de ingreso",
    [ADMISSION_NOTIFICATION_TYPE.rejected]: "Se rechazó una solicitud de ingreso",
    [ADMISSION_NOTIFICATION_TYPE.cancelled]: "Se canceló una solicitud de ingreso",
    [ADMISSION_NOTIFICATION_TYPE.expired]: "Una solicitud de ingreso venció",
    [ADMISSION_NOTIFICATION_TYPE.reminder]: "Hay una solicitud pendiente de revisión",
  },
} as const;
