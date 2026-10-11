/** Owns safe notification recovery feedback without claiming provider delivery or restoring confirmation. @module notification-recovery-ui */
/** Shows only the ISO calendar-date portion, independent from viewer/server timezone during hydration. */
export const NOTIFICATION_RECOVERY_DATE_LABEL_CHARACTERS = 10;
export const NOTIFICATION_RECOVERY_UI_COPY = {
  storageUnavailable: "No pudimos conservar la referencia en esta pestaña. No se iniciará otra recuperación hasta poder guardarla.",
  selectionRequired: "Elegí un aviso y otra conexión seleccionada antes de recuperar su entrega.",
  consentRequired: "Revisá el aviso y la conexión y marcá la confirmación antes de continuar.",
  pending: "No pudimos confirmar el resultado. La referencia está conservada; consultá la recuperación original antes de otra acción.",
  reading: "Consultando el estado actual de los avisos…",
  originalReading: "Consultando la recuperación original…",
  originalAbsent: "El intento original todavía no tiene un resultado registrado. Podés consultar otra vez o reanudar ese mismo intento con una nueva confirmación.",
  originalStarted: "La recuperación original sigue en curso. Consultá otra vez antes de reanudar ese mismo intento.",
  completed: "La recuperación quedó registrada. Consultá el estado de la entrega nueva; aún no se afirma que el aviso se haya entregado.",
  stopped: "Se detuvo la observación. El servidor puede continuar; se conserva la referencia original antes de otra acción.",
  currentRequired: "La sesión cambió. Volvé a abrir esta pantalla con tu cuenta actual antes de continuar.",
  preparingGoogle: "Preparando la confirmación de este aviso con Google…",
  googleFailed: "No pudimos preparar la confirmación. Conservá el aviso seleccionado y volvé a intentarlo.",
  historyFull: "El historial de esta pestaña está lleno. Conservá y consultá las referencias anteriores; no se borrará un intento para iniciar otro.",
  archived: "La referencia quedó conservada en el historial. El servidor puede continuar; revisá el estado actual antes de otra acción.",
} as const;
