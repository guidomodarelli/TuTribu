/** Names declared-number transitions independently of verification and transport. @module admission-whatsapp-number-constants */
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "./admission-errors";
export const ADMISSION_WHATSAPP_CHANGE_OUTCOME = { changed: "changed", unchanged: "unchanged", denied: "denied" } as const;
/** Binds the original declared-number command to its own recoverable ledger namespace. */
export const ADMISSION_WHATSAPP_OPERATION = "update_admission_whatsapp";
/** Distinguishes an exact local correction intent from submission and cancellation. */
export const ADMISSION_WHATSAPP_INTENT_KIND = "whatsapp";
/** Validates only the canonical number in own public DTOs, independently of raw-input normalization. */
export const ADMISSION_WHATSAPP_CANONICAL_PATTERN = /^\+[1-9][0-9]{1,14}$/u;
/** Records version lineage without retaining the current or former declared number. */
export const ADMISSION_WHATSAPP_AUDIT_EVENT = "whatsapp_number_changed";
/** Shares the versioned constraint identity with the ORM projection. */
export const ADMISSION_WHATSAPP_NUMBER_CONSTRAINT = "admission_request_whatsapp_number_check";
/** Names the same-origin user action for diagnostics and browser routing. */
export const ADMISSION_WHATSAPP_HTTP_OPERATION = "admission-whatsapp-number-update";
export const ADMISSION_WHATSAPP_ROUTE_SEGMENT = "whatsapp";
/** Classifies browser parser failures without logging the declared number or raw diagnostics. */
export const ADMISSION_WHATSAPP_VALIDATION_OPERATION = "admission-whatsapp-draft-validation";
/** Localizes declared-data collection without implying possession or group verification. */
export const ADMISSION_WHATSAPP_COPY = {
  label: "Teléfono",
  optionalLabel: "Teléfono (opcional)",
  help: "Usá el número que tenés en el grupo. El equipo lo revisará junto al nombre de tu cuenta de Google.",
  formatHelp: "Incluí el prefijo del país, por ejemplo +1 202 555 0117.",
  invalid: "Ingresá un teléfono válido con el prefijo del país.",
  required: ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.whatsappNumberRequired],
  notProvided: "No informó teléfono",
  declared: "Número declarado; la pertenencia al grupo se revisa manualmente.",
  policyLabel: "Exigir el teléfono del solicitante",
  policyHelp: "Si no lo exigís, completarlo es opcional. El equipo lo compara manualmente con el grupo; esta opción no activa códigos ni envíos.",
  editTitle: "Tu teléfono",
  currentNumber: "Actualmente informado",
  confirmEdit: "Revisé el número y quiero guardar este cambio.",
  save: "Guardar teléfono",
  saving: "Guardando teléfono…",
  saved: "Se guardó tu cambio de teléfono.",
  unchanged: "El teléfono ya estaba guardado.",
  readOriginal: "Consultar operación original",
  retryOriginal: "Reintentar el cambio original",
  readCurrent: "Consultar solicitud actual",
  uncertain: "Todavía no pudimos confirmar el cambio. Consultá la operación original antes de volver a guardar.",
  readFailed: "No pudimos consultar la solicitud. Conservá el número y volvé a consultar.",
  stale: "La solicitud cambió. Consultá su estado, compará el número actual y volvé a confirmar.",
  storageFailed: "No pudimos preparar el cambio en este navegador. Conservá el número y volvé a consultar.",
} as const;
