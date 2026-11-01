/** Keeps batch confirmation, uncertainty and terminal conflict feedback distinct. @module admission-batch-review-ui */
import type { AdmissionBatchResultDto } from "../application/results/admission-flow-result-schemas";
export const ADMISSION_BATCH_REVIEW_COPY = {
  title: "Decidir solicitudes seleccionadas", select: "Seleccionar", selectPrefix: "Seleccionar solicitud de",
  selected: "Solicitudes seleccionadas", limit: "Máximo por lote", confirmation: "Confirmo esta decisión sobre todas las solicitudes enumeradas",
  approve: "Aprobar seleccionadas", reject: "Rechazar seleccionadas",
  limitReached: "Llegaste al máximo de solicitudes por lote. Quitá una para elegir otra.",
  selectionChanged: "Cambió una solicitud seleccionada. Revisá la selección y confirmá de nuevo.",
  invalid: "Seleccioná solicitudes visibles, escribí el motivo interno y confirmá la lista antes de decidir.",
  uncertain: "El resultado del lote no está confirmado. Consultá la operación original antes de volver a intentar.",
  started: "La operación original está registrada y todavía no tiene un resultado definitivo. Si no avanza, confirmá de nuevo y reintentá el mismo lote: no se aplica dos veces.",
  retry: "Reintentar el mismo lote", clear: "Quitar selección", dismiss: "Cerrar resultados",
  results: "Resultados del lote", completed: "Decisiones confirmadas", failed: "Sin decisión aplicada", unresolved: "Sin resolución confirmada",
  original: "Esta es la selección original. Consultar o recuperar no vuelve a decidir las solicitudes.",
  revalidation: "Cada solicitud se vuelve a comprobar. El resultado puede incluir conflictos o decisiones que no pudieron aplicarse.",
  unknownApplicant: "Solicitante de la selección original",
} as const;
/** A terminal conflict does not mean that the applicant's request was rejected. */
export const ADMISSION_BATCH_REVIEW_RESULT_COPY = {
  all_succeeded: "Todas las decisiones del lote quedaron confirmadas.",
  mixed: "Se confirmaron algunas decisiones. Revisá los conflictos individuales del lote.",
  all_rejected: "No se aplicaron decisiones del lote. Revisá el resultado de cada solicitud.",
  incomplete: "El resultado original todavía no está resuelto.",
} as const satisfies Record<AdmissionBatchResultDto["result"], string>;
