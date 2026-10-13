/** Owns concise Spanish reviewer feedback and viewer-scoped local storage. @module admission-review-ui */
export const ADMISSION_REVIEW_STORAGE_PREFIX = "tutribu-admission-review-intent";

/** Explains current review restrictions without changing permission, membership or request state. */
export const ADMISSION_REVIEW_ELIGIBILITY_COPY: Readonly<Record<string, string | undefined>> = {
  admission_closed: "Las admisiones no están disponibles para aprobar esta solicitud. Su plazo no cambia.",
  admission_scope_mismatch: "No se puede confirmar el alcance actual de la solicitud. Consultá su estado nuevamente.",
  contact_account_mismatch: "El contacto de la solicitud no coincide con la cuenta actual del solicitante.",
  contact_type_mismatch: "El tipo de contacto no coincide con la configuración actual de admisión.",
  contact_conflict: "El contacto tiene una vinculación que impide aprobar esta solicitud.",
  allowlist_requirement_unmet: "No se cumple la lista exigida para esta solicitud.",
  invitation_unusable: "La autorización de la invitación ya no permite aprobar esta solicitud.",
  invitation_recipient_unproven: "El destinatario de la invitación necesita una comprobación vigente de su contacto.",
  phone_invitation_unavailable: "La invitación por teléfono necesita una comprobación de contacto habilitada.",
  membership_restricted: "La pertenencia actual del solicitante impide aprobar esta solicitud.",
  membership_recovery_unknown: "La pertenencia del solicitante necesita una revisión antes de aprobar esta solicitud.",
  local_proof_required: "La persona necesita comprobar el contacto de esta solicitud antes de que pueda aprobarse.",
  evidence_revoked: "La prueba de contacto fue revocada. La persona necesita comprobar el contacto nuevamente.",
  request_expired: "La solicitud venció. No puede aprobarse y conserva su plazo original.",
  reviewer_unauthorized: "Tu permiso actual no permite decidir sobre esta solicitud.",
  exception_reason_required: "La aprobación por excepción exige un motivo interno explícito.",
};
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
