/** Owns the manual admission UI vocabulary and bounded browser recovery. @module admission-ui */
export const ADMISSION_UI_PHASE = { idle: "idle", writing: "writing", checking: "checking", uncertain: "uncertain" } as const;
export const ADMISSION_DRAFT_STORAGE_PREFIX = "tutribu-admission-draft";
export const ADMISSION_UI_CLOCK_INTERVAL_MS = 60_000;
export const ADMISSION_UI_COPY = {
  title: "Solicitar ingreso", statusTitle: "Tu solicitud de ingreso", unavailableTitle: "No podemos mostrar esta admisión",
  description: "Tu solicitud permite revisar el ingreso a la academia. Hasta que se apruebe, no da acceso a su contenido.",
  signIn: "Iniciar sesión", home: "Ir al inicio", submit: "Solicitar ingreso", submitting: "Enviando solicitud…",
  read: "Consultar estado", reading: "Consultando estado…", cancel: "Cancelar solicitud", cancelling: "Cancelando solicitud…",
  confirm: "Confirmo que quiero solicitar ingreso a esta academia", confirmCancel: "Confirmo que quiero cancelar esta solicitud",
  confirmationRequired: "Confirmá la acción antes de continuar.", message: "Mensaje para los responsables (opcional)",
  phone: "Teléfono", country: "País del teléfono", countryHelp: "Usá el código de dos letras del país y un número con su prefijo internacional.",
  declared: "Este contacto fue declarado y no está comprobado.", verified: "La comprobación del contacto tiene el alcance indicado por la academia.",
  email: "Se usa el correo de tu cuenta. Esta solicitud no lo convierte en un contacto comprobado.",
  expires: "Plazo de la solicitud", submitted: "Presentada", retryAt: "Podés volver a presentar desde", retry: "Volver a solicitar ingreso",
  pending: "La solicitud está pendiente de revisión.", approved: "Tu solicitud fue aprobada.", rejected: "Tu solicitud no fue aprobada.",
  cancelled: "La solicitud fue cancelada.", expired: "El plazo de la solicitud venció.",
  verifying: "Esta academia requiere comprobar el contacto antes de presentar una solicitud.",
  uncertain: "Todavía no pudimos confirmar el resultado. Consultá la operación original antes de repetir la acción.",
  absent: "La operación todavía no aparece registrada. Podés reintentar el mismo envío conservando sus datos.",
  retryOriginal: "Reintentar el mismo envío", readFailed: "No pudimos consultar el estado actualizado. Conservamos lo último confirmado.",
  accountChanged: "La cuenta o la sesión cambió. Volvé a cargar esta página para continuar con la cuenta actual.",
  reloadAccount: "Volver a cargar la página", storageFailed: "No pudimos conservar el identificador del envío en este navegador. Revisá el almacenamiento de la sesión y volvé a intentar.",
  draftInvalid: "Revisá el teléfono, su país y la longitud del mensaje antes de continuar.",
  outcomePending: "La solicitud quedó pendiente de revisión.", outcomeMember: "Ya tenés acceso básico a la academia.", openAcademy: "Abrir academia",
} as const;
