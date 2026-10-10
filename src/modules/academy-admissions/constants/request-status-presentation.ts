/** Owns request-state display copy separately from initial admission instructions. @module request-status-presentation */
import { ADMISSION_UI_COPY } from "./admission-ui";

/** Displays the stored status without converting a derived expiry reason into a persisted terminal state. */
export const ADMISSION_REQUEST_STATUS_COPY = { pending: ADMISSION_UI_COPY.pending, approved: ADMISSION_UI_COPY.approved, rejected: ADMISSION_UI_COPY.rejected, cancelled: ADMISSION_UI_COPY.cancelled, expired: ADMISSION_UI_COPY.expired } satisfies Record<"pending" | "approved" | "rejected" | "cancelled" | "expired", string>;

/** Explains a corrective action on the already submitted request, without implying another submission. */
export const ADMISSION_REQUEST_REVERIFICATION_COPY = {
  required: "Necesitás comprobar el contacto de esta solicitud pendiente para que puedan aprobarla.",
  revoked: "La prueba de contacto de esta solicitud fue revocada. Necesitás comprobar el contacto nuevamente para que puedan aprobarla.",
} as const;
