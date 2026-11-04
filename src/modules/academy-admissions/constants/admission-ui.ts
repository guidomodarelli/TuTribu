/** Owns the manual admission UI vocabulary and bounded browser recovery. @module admission-ui */
import { ADMISSION_ERROR_CODE, type AdmissionErrorCode } from "./admission-errors";

export const ADMISSION_UI_PHASE = { idle: "idle", writing: "writing", checking: "checking", uncertain: "uncertain" } as const;
export const ADMISSION_DRAFT_STORAGE_PREFIX = "tutribu-admission-draft";
export const ADMISSION_UI_CLOCK_INTERVAL_MS = 60_000;
export const ADMISSION_UI_COPY = {
  title: "Solicitar ingreso", statusTitle: "Tu solicitud de ingreso", unavailableTitle: "No podemos mostrar esta admisión",
  description: "Tu solicitud permite revisar el ingreso a la academia. Hasta que se apruebe, no da acceso a su contenido.",
  signIn: "Iniciar sesión", home: "Ir al inicio", submit: "Solicitar ingreso", submitting: "Enviando solicitud…",
  read: "Consultar estado", reading: "Consultando estado…", cancel: "Cancelar solicitud", cancelling: "Cancelando solicitud…",
  confirm: "Confirmo que quiero solicitar ingreso a esta academia", confirmCancel: "Confirmo que quiero cancelar esta solicitud",
  confirmationRequired: "Confirmá la acción antes de continuar.", contactRecovery: "La operación del código no quedó confirmada. Consultala antes de seguir.", message: "Mensaje para los responsables (opcional)",
  phone: "Teléfono", country: "País del teléfono", countryHelp: "Usá el código de dos letras del país y un celular con su prefijo internacional, por ejemplo +54 9 11 1234 5678.",
  declared: "Este contacto fue declarado y no está comprobado.", verified: "La comprobación del contacto tiene el alcance indicado por la academia.",
  email: "Se usa el correo de tu cuenta. Esta solicitud no lo convierte en un contacto comprobado.",
  expires: "Plazo de la solicitud", submitted: "Presentada", retryAt: "Podés volver a presentar desde", retry: "Volver a solicitar ingreso",
  pending: "La solicitud está pendiente de revisión.", approved: "Tu solicitud fue aprobada.", rejected: "Tu solicitud no fue aprobada.",
  cancelled: "La solicitud fue cancelada.", expired: "El plazo de la solicitud venció.",
  verifying: "Esta academia requiere comprobar el contacto antes de presentar una solicitud.",
  uncertain: "Todavía no pudimos confirmar el resultado. Consultá la operación original antes de repetir la acción.",
  absent: "La operación todavía no aparece registrada. Podés reintentar el mismo envío conservando sus datos.",
  started: "La operación quedó registrada pero todavía no terminó de procesarse. Podés reintentar el mismo envío con los mismos datos: no se repite si ya se aplicó.",
  retryOriginal: "Reintentar el mismo envío", readFailed: "No pudimos consultar el estado actualizado. Conservamos lo último confirmado.",
  accountChanged: "La cuenta o la sesión cambió. Volvé a cargar esta página para continuar con la cuenta actual.",
  reloadAccount: "Volver a cargar la página", storageFailed: "No pudimos conservar el identificador del envío en este navegador. Revisá el almacenamiento de la sesión y volvé a intentar.",
  draftInvalid: "Revisá el teléfono, su país y la longitud del mensaje antes de continuar.",
  outcomePending: "La solicitud quedó pendiente de revisión.", outcomeMember: "Ya tenés acceso básico a la academia.", openAcademy: "Abrir academia",
  changeAccount: "Cambiar de cuenta", changingAccount: "Cerrando la sesión…",
  retryUnavailable: "Reintentar",
  /** Leaves a page whose address (filters, selection, extra parameters) caused a deterministic refusal, opening it without its query. */
  initialView: "Volver a la vista inicial",
} as const;

/**
 * Page-read failures that can pass on their own (a dependency or the server was briefly unavailable, or a change landed between
 * the statements of one read), so reading the page again may show it. A missing session, a permission denial, an invalid link
 * or a missing resource fail the same way on every read and never offer a retry.
 */
export const ADMISSION_TRANSIENT_PAGE_ERROR_CODES: readonly AdmissionErrorCode[] = [
  ADMISSION_ERROR_CODE.unexpectedFailure, ADMISSION_ERROR_CODE.publicContractUnusable, ADMISSION_ERROR_CODE.dependencyUnavailable,
  ADMISSION_ERROR_CODE.transportTimeout, ADMISSION_ERROR_CODE.upstreamPayloadUnusable, ADMISSION_ERROR_CODE.providerRateLimited,
  ADMISSION_ERROR_CODE.policyConflict, ADMISSION_ERROR_CODE.requestConflict,
];

/** Where the applicant page shows an error: next to the step, action or field that produced it, or on the page itself. */
export type AdmissionFeedbackOrigin = "page" | "submit" | "cancel" | "whatsapp";

/** Names each feedback origin of the applicant page. */
export const ADMISSION_FEEDBACK_ORIGIN = { page: "page", submit: "submit", cancel: "cancel", whatsapp: "whatsapp" } as const satisfies Record<string, AdmissionFeedbackOrigin>;

/**
 * Definitive write refusals that mean the server state behind the page changed (rules, request, invitation or proof):
 * the page reads that state again and asks for a new confirmation, so a retry never resends the version it refused.
 */
export const ADMISSION_STATE_CHANGED_WRITE_CODES: readonly AdmissionErrorCode[] = [
  ADMISSION_ERROR_CODE.policyConflict, ADMISSION_ERROR_CODE.admissionsPaused, ADMISSION_ERROR_CODE.additionalVerificationRequired,
  ADMISSION_ERROR_CODE.proofUnavailable, ADMISSION_ERROR_CODE.admissionIneligible, ADMISSION_ERROR_CODE.invitationUnavailable,
  ADMISSION_ERROR_CODE.requestConflict, ADMISSION_ERROR_CODE.requestExpired,
];

/** Applicant copy for refusals whose shared catalogue copy addresses whoever edits the rules. */
export const ADMISSION_APPLICANT_REFUSAL_COPY: Readonly<Partial<Record<AdmissionErrorCode, string>>> = {
  [ADMISSION_ERROR_CODE.policyConflict]: "Las reglas de la academia cambiaron. Actualizamos los datos; volvé a confirmar.",
};
