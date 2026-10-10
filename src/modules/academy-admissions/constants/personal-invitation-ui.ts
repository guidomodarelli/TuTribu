/** Owns personal confirmation phases and Spanish feedback without private recipient hints. @module personal-invitation-ui-constants */
export const PERSONAL_INVITATION_UI_PHASE = { idle: "idle", reading: "reading", submitting: "submitting", changingAccount: "changing_account", uncertain: "uncertain" } as const;
/** Observation deadlines never alter server ledger acceptance or retry policy. */
export const PERSONAL_INVITATION_UI_TIMEOUT_MS = 120_000;
/** Product copy is independent of private denial reasons and provider messages. */
export const PERSONAL_INVITATION_UI_COPY = {
  title: "Invitación personal", description: "Revisá el ingreso y confirmá cuando quieras continuar. Abrir este enlace no envía una solicitud.",
  confirm: "Confirmo que quiero usar esta invitación para ingresar a la academia.", confirmationRequired: "Confirmá el uso de la invitación antes de continuar.",
  submit: "Confirmar invitación", submitting: "Confirmando invitación…", reading: "Comprobando la cuenta y la operación original…", read: "Consultar estado", original: "Consultar operación original",
  changeAccount: "Cambiar de cuenta", changingAccount: "Cerrando la sesión…", accountChanged: "La cuenta cambió. Volvé a cargar este enlace para continuar con la cuenta actual.", reloadAccount: "Continuar con la cuenta actual",
  storage: "No pudimos conservar la operación en este navegador. Habilitá el almacenamiento antes de confirmar.",
  uncertain: "Todavía no pudimos confirmar el resultado. Conservamos la operación original: consultala antes de intentar otro ingreso.",
  absent: "La operación original todavía no aparece. Conservamos su referencia para consultarla nuevamente.",
  verification: "Comprobá tu contacto antes de confirmar la invitación.", verificationUnavailable: "La comprobación adicional no está disponible ahora. Podés consultar nuevamente o comunicarte con los responsables.",
  common: "Elegir la vía común de ingreso", commonHelp: "Es otra vía de ingreso. Vas a revisar sus requisitos y confirmar una solicitud por separado.",
  restriction: "Esta invitación requiere que tu contacto siga habilitado en la lista de la academia.", exemption: "Esta invitación permite ingresar sin pertenecer a la lista; conserva los demás requisitos de la academia.",
  pending: "Tu solicitud está pendiente de revisión.", admitted: "Ya tenés acceso básico a la academia.", ownRequest: "Ver mi solicitud", openAcademy: "Abrir academia",
} as const;
