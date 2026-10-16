/** Owns reviewer filter presentation vocabulary independently of server authority. @module admission-review-filters */
import { ADMISSION_REQUEST_STATUS } from "./admission-request";
import { ADMISSION_PUBLIC_SOURCE } from "./admission-public-contract";
import { ADMISSION_REVIEW_ALL_STATUSES } from "./admission-review-selection";
import { ADMISSION_REVIEW_BOOLEAN_QUERY } from "./admission-review-input";
import { ADMISSION_REVIEW_SOURCE_LABEL } from "./admission-review-ui";

/** Unrestricted optional controls omit their API field; this is not a domain status. */
export const ADMISSION_REVIEW_FILTER_ANY = "any";
/** Native datetime-local can omit seconds; the boundary still requires an ISO instant. */
export const ADMISSION_REVIEW_FILTER_MINUTE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;
/** All selectors preserve an explicit false separately from an unrestricted selection. */
export const ADMISSION_REVIEW_FILTER_GROUPS = [
  { field: "status", label: "Estado", options: [
    { value: ADMISSION_REVIEW_ALL_STATUSES, label: "Todos los estados" },
    { value: ADMISSION_REQUEST_STATUS.pending, label: "Pendientes" },
    { value: ADMISSION_REQUEST_STATUS.approved, label: "Aprobadas" },
    { value: ADMISSION_REQUEST_STATUS.rejected, label: "Rechazadas" },
    { value: ADMISSION_REQUEST_STATUS.cancelled, label: "Canceladas" },
    { value: ADMISSION_REQUEST_STATUS.expired, label: "Vencidas" },
  ] },
  { field: "source", label: "Origen", options: [
    { value: ADMISSION_REVIEW_FILTER_ANY, label: "Todos los orígenes" },
    { value: ADMISSION_PUBLIC_SOURCE.common, label: ADMISSION_REVIEW_SOURCE_LABEL.common },
    { value: ADMISSION_PUBLIC_SOURCE.personal, label: ADMISSION_REVIEW_SOURCE_LABEL.personal },
    { value: ADMISSION_PUBLIC_SOURCE.legacy, label: ADMISSION_REVIEW_SOURCE_LABEL.legacy },
  ] },
  { field: "requiresExceptionReason", label: "Motivo de excepción", options: [
    { value: ADMISSION_REVIEW_FILTER_ANY, label: "Cualquier requisito" },
    { value: ADMISSION_REVIEW_BOOLEAN_QUERY.yes, label: "Requiere motivo ahora" },
    { value: ADMISSION_REVIEW_BOOLEAN_QUERY.no, label: "Sin ese requisito actual" },
  ] },
  { field: "needsVerification", label: "Comprobación de contacto", options: [
    { value: ADMISSION_REVIEW_FILTER_ANY, label: "Cualquier requisito" },
    { value: ADMISSION_REVIEW_BOOLEAN_QUERY.yes, label: "Requiere comprobación" },
    { value: ADMISSION_REVIEW_BOOLEAN_QUERY.no, label: "Sin ese requisito actual" },
  ] },
] as const;
/** Dates are explicit UTC instants, matching the HTTP contract and deterministic server rendering. */
export const ADMISSION_REVIEW_FILTER_DATES = [
  { field: "submittedFrom", label: "Desde (UTC)" },
  { field: "submittedUntil", label: "Hasta (UTC)" },
] as const;
/** Filter validation is separate from decision confirmation and operation feedback. */
export const ADMISSION_REVIEW_FILTER_COPY = {
  title: "Filtrar solicitudes", search: "Búsqueda", apply: "Aplicar filtros", reset: "Mostrar pendientes",
  description: "Buscá y filtrá las solicitudes. Abrir un detalle conserva esta selección.",
  dateHelp: "Indicá fecha y hora en UTC. Si no aparece un selector, usá AAAA-MM-DDTHH:mm. El detalle muestra la hora de Buenos Aires.", datePlaceholder: "AAAA-MM-DDTHH:mm",
  invalid: "Revisá la búsqueda y las fechas: el inicio debe ser anterior o igual al final.",
  blocked: "Terminá la consulta o recuperá la decisión original antes de cambiar los filtros.",
  emptyPage: "No hay coincidencias en este tramo. Podés seguir consultando con «Ver más solicitudes».",
} as const;
