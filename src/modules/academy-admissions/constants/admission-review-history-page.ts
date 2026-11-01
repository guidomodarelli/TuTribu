/** Owns request-history navigation, presentation vocabulary and the public page contract. @module admission-review-history-page-constants */
import { z } from "zod";
import type { AdmissionReviewHistoryPageState } from "../application/results/admission-review-history-page-state";
import type { AdmissionReviewHistoryActorKind, AdmissionReviewHistoryEventKind } from "../domain/entities/admission-review-history-event";
import { ADMISSION_ERROR_CODE } from "./admission-errors";
import { admissionReviewHistoryPageSchema } from "./admission-review-history-schemas";
import { admissionReviewSelectionSchema } from "./admission-review-selection";
import { admissionReadErrorMessage } from "@/src/modules/academy-admissions/constants/admission-read-errors";

/** History continuation is independent of the inbox selection retained only for return navigation. */
export const ADMISSION_REVIEW_HISTORY_NAVIGATION = { segment: "history", cursorQuery: "historyCursor" } as const;
/** Copy stays separate from actor identifiers and raw historical payloads. */
export const ADMISSION_REVIEW_HISTORY_COPY = {
  title: "Historial de la solicitud", open: "Ver historial de la solicitud", back: "Volver al detalle", refresh: "Actualizar historial",
  description: "Eventos disponibles de esta solicitud, del más reciente al más antiguo. Cada consulta comprueba tu acceso actual.",
  empty: "No hay eventos disponibles en el historial conservado de esta solicitud.",
  older: "Ver eventos anteriores", newest: "Volver a los eventos más recientes",
  checking: "Comprobando tu acceso al historial…", readFailed: "No pudimos comprobar tu acceso al historial. Reintentá la consulta.",
  changedViewer: "Tu cuenta cambió. Actualizá el historial para comprobar el acceso de la cuenta actual.",
  actor: "Atribución", from: "Estado anterior", to: "Estado posterior", version: "Versión de la solicitud",
} as const;
/** Retention cannot establish whether a missing actor was a person or an automated process. */
export const ADMISSION_REVIEW_HISTORY_ACTOR_LABEL = { account: "Cuenta registrada", unattributed: "Sin atribución disponible" } as const satisfies Readonly<Record<AdmissionReviewHistoryActorKind, string>>;
/** Only the owned normalized vocabulary is displayed, never raw event names. */
export const ADMISSION_REVIEW_HISTORY_EVENT_LABEL = {
  pending_created: "Solicitud presentada", proof_attached: "Verificación incorporada", approved: "Solicitud aprobada", rejected: "Solicitud rechazada",
  cancelled: "Solicitud cancelada", expired: "Solicitud vencida", retry_allowed: "Nuevo intento habilitado", unclassified: "Evento conservado",
} as const satisfies Readonly<Record<AdmissionReviewHistoryEventKind, string>>;
/** Strict own props reject private additions even when an inward adapter returns an otherwise valid page. */
export const admissionReviewHistoryPageStateSchema: z.ZodType<AdmissionReviewHistoryPageState> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ready"), slug: z.string().min(1), viewerId: z.string().min(1), renderedAt: z.iso.datetime({ precision: 3 }), filters: admissionReviewSelectionSchema, page: admissionReviewHistoryPageSchema, hasPrevious: z.boolean() }),
  z.strictObject({ kind: z.literal("unavailable"), code: z.enum(ADMISSION_ERROR_CODE), message: z.string() }).refine((state) => state.message === admissionReadErrorMessage(state.code)),
]);
