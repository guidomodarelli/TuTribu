/** Owns safe notification recovery feedback without claiming provider delivery or restoring confirmation. @module notification-recovery-ui */
/** Shows only the ISO calendar-date portion, independent from viewer/server timezone during hydration. */
export const NOTIFICATION_RECOVERY_DATE_LABEL_CHARACTERS = 10;
/** The recovery write the leader pressed: only that control shows progress while the other writes stay disabled. */
export type NotificationRecoveryWriteAction = "register" | "resume" | "archive";
/** Registering creates a new original; resuming replays the preserved one; archiving only moves it to local history. */
export const NOTIFICATION_RECOVERY_WRITE_ACTION = { register: "register", resume: "resume", archive: "archive" } as const satisfies Record<NotificationRecoveryWriteAction, NotificationRecoveryWriteAction>;
export const NOTIFICATION_RECOVERY_UI_COPY = {
  storageUnavailable: "No pudimos conservar la referencia en esta pestaña. No se iniciará otra recuperación hasta poder guardarla.",
  selectionRequired: "Elegí un aviso y otra conexión seleccionada antes de recuperar su entrega.",
  consentRequired: "Revisá el aviso y la conexión y marcá la confirmación antes de continuar.",
  pending: "No pudimos confirmar el resultado. La referencia está conservada; consultá la recuperación original antes de otra acción.",
  reading: "Consultando el estado actual de los avisos…",
  registering: "Registrando la recuperación…",
  originalReading: "Consultando la recuperación original…",
  originalAbsent: "El intento original todavía no tiene un resultado registrado. Podés consultar otra vez o reanudar ese mismo intento con una nueva confirmación.",
  originalStarted: "La recuperación original sigue en curso. Consultá otra vez antes de reanudar ese mismo intento.",
  completed: "La recuperación quedó registrada. Consultá el estado de la entrega nueva; aún no se afirma que el aviso se haya entregado.",
  stopped: "Se detuvo la observación. El servidor puede continuar; se conserva la referencia original antes de otra acción.",
  currentRequired: "La sesión cambió. Volvé a abrir esta pantalla con tu cuenta actual antes de continuar.",
  historyFull: "El historial de esta pestaña está lleno. Conservá y consultá las referencias anteriores; no se borrará un intento para iniciar otro.",
  expired: "Este aviso ya no se puede recuperar: venció su plazo. Elegí otro aviso con plazo vigente.",
  /** A notice already delivered, no longer owed, or prepared under an earlier platform security: no recovery can apply to it. */
  unavailable: "Este aviso ya no se puede recuperar: ya se entregó, dejó de corresponder o se preparó con una seguridad anterior de la plataforma. Consultá los avisos otra vez.",
  targetNotReady: "La conexión de destino tiene que estar seleccionada, activa y con el correo probado antes de recuperar un aviso.",
  archived: "La referencia quedó conservada en el historial. El servidor puede continuar; revisá el estado actual antes de otra acción.",
  /** Shown once an unregistered original is forgotten because the platform cannot protect a recovery: nothing is left to resume. */
  platformForgotten: "La recuperación anterior no quedó registrada y no hace falta reanudarla. Vas a poder recuperar avisos cuando el equipo de TuTribu resuelva la seguridad de la plataforma.",
} as const;
