/** Owns concise Spanish reviewer feedback and viewer-scoped local storage. @module admission-review-ui */
export const ADMISSION_REVIEW_STORAGE_PREFIX = "tutribu-admission-review-intent";
/** Local phases never imply that unconfirmed work was accepted by the server. */
export const ADMISSION_REVIEW_PHASE = { idle: "idle", reading: "reading", writing: "writing", uncertain: "uncertain", changedViewer: "changed_viewer" } as const;
/** Labels distinguish an original local intention from confirmed server work. */
export const ADMISSION_REVIEW_UI_COPY = {
  title: "Solicitudes de ingreso", description: "Revisá las solicitudes más antiguas primero. Aprobar concede la membresía básica de la academia.",
  empty: "No hay solicitudes pendientes.", read: "Consultar estado actual", loadMore: "Ver más solicitudes", detail: "Revisar solicitud", close: "Volver a la bandeja",
  internalReason: "Motivo interno", externalMessage: "Mensaje para el solicitante (opcional)", internalHelp: "Este motivo sólo lo ven quienes revisan las solicitudes.",
  externalHelp: "El solicitante podrá ver este mensaje. No incluyas datos privados.", confirm: "Confirmo esta decisión sobre la solicitud seleccionada",
  approve: "Aprobar ingreso", reject: "Rechazar solicitud", writing: "Guardando decisión…", reading: "Consultando…",
  invalid: "Escribí un motivo interno y confirmá la decisión. Respetá los límites indicados.",
  uncertain: "La decisión no está confirmada. Consultá la operación original antes de volver a intentar.", retry: "Reintentar la misma decisión", recovered: "Se confirmó la decisión original.",
  complete: "La decisión quedó guardada.", readFailed: "No pudimos consultar la revisión actual. Volvé a consultar antes de decidir.",
  changedViewer: "La cuenta cambió. Recargá la página para consultar la bandeja de esta cuenta.", storageFailed: "No pudimos conservar la decisión en este navegador. Habilitá el almacenamiento de sesión y volvé a consultar.",
  reload: "Recargar con la cuenta actual", declared: "Contacto declarado: no acredita verificación", none: "Solicitud sin contacto verificado",
  base: "Correo acreditado por Google para la cuenta", local: "Contacto verificado para esta solicitud de la academia",
} as const;
