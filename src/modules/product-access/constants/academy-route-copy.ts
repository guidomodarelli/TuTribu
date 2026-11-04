/**
 * Safe Spanish messages returned by the academy and verification routes.
 *
 * @module academy-route-copy
 */

export const ACADEMY_ROUTE_COPY = {
  checkoutUnresolved:
    "Estamos verificando si Mercado Pago preparó tu pago. Esperá un par de minutos y volvé a intentar; no se generó un cobro nuevo.",
  checkoutIntegrationUnavailable:
    "El cobro de esta tribu no está disponible: quien la administra tiene que volver a conectar Mercado Pago. No se generó ningún cobro.",
  checkoutRejected:
    "Mercado Pago no pudo iniciar el pago. No se generó ningún cobro. Si vuelve a pasar, avisá a quien administra la tribu.",
  cancelIntegrationUnavailable:
    "No pudimos cancelar porque la conexión de la tribu con Mercado Pago no está disponible. Podés cancelar la suscripción desde tu cuenta de Mercado Pago.",
  cancelRejected: "Mercado Pago rechazó la cancelación. Podés cancelarla desde tu cuenta de Mercado Pago.",
  cancelUnavailable: "No pudimos contactar a Mercado Pago. Tu renovación sigue activa; intentá de nuevo más tarde.",
  cancelUnconfirmed:
    "Registramos tu pedido de cancelación, pero Mercado Pago todavía no lo confirmó. Tocá «Actualizar estado» en unos minutos para confirmarlo.",
  joinUnavailable: "No pudimos sumarte a la tribu. Intentá de nuevo en unos minutos.",
  reconcileIntegrationUnavailable:
    "No podemos consultar Mercado Pago hasta que quien administra la tribu vuelva a conectarlo. Tu acceso confirmado se mantiene.",
  requestRequired: "Esta academia ahora pide una solicitud de ingreso.",
  admissionClosed: "Las admisiones de esta tribu no están abiertas en este momento.",
  alreadyMember: "Ya formás parte de esta tribu.",
  alreadyRevoked: "Esa bonificación ya estaba revocada.",
  alreadySubscribed: "Ya tenés una suscripción a la academia. Gestionala desde tu estado de acceso.",
  blocked: "No podés ingresar a esta tribu.",
  bonusGranted: "Bonificación otorgada.",
  bonusReplayed: "Esa bonificación ya estaba registrada.",
  bonusRevoked: "Bonificación revocada.",
  cancelConfirmed: "Cancelaste la renovación. Conservás el acceso ya pagado hasta su vencimiento.",
  cancelNotFound: "No encontramos una renovación activa para cancelar.",
  checkoutUnavailable: "No pudimos iniciar el pago. Intentá de nuevo en unos minutos; no se generó un cobro nuevo.",
  covered: "Ya tenés acceso vigente a la academia.",
  duplicateProviderKey: "Ya existe un proveedor con esa clave.",
  idempotencyConflict: "Esa operación ya se usó para otra persona. Recargá la página y volvé a intentarlo.",
  joined: "Te sumaste a la tribu.",
  notAcademy: "Esta tribu todavía no funciona en modo academia.",
  notEligible: "Confirmá tu vinculación para acceder a la academia.",
  offerChanged: "La oferta cambió. Revisá las condiciones actualizadas antes de continuar.",
  offerSaved: "Oferta guardada.",
  providerLimitReached: "Alcanzaste el máximo de proveedores para esta tribu.",
  providerSaved: "Proveedor guardado.",
  providerUnavailable: "Ese proveedor no está disponible.",
  reasonRequired: "Indicá un motivo para esta decisión.",
  recipientNotEligible: "Esa persona no tiene una membresía vigente en la tribu.",
  recipientNotVerified: "Esa persona no tiene una vinculación verificada. Confirmá la excepción e indicá el motivo.",
  replacedGrantNotFound: "La bonificación a reemplazar ya no está vigente.",
  reconcileThrottled: "Ya revisamos tu estado hace instantes. Probá de nuevo en un minuto.",
  salesActivationDisabled: "La venta de la academia todavía no está habilitada para este despliegue.",
  salesClosed: "La venta de la academia está pausada.",
  settingsSaved: "Configuración guardada.",
  verificationDecided: "Decisión registrada.",
  verificationInvalidTransition: "La solicitud ya no está en un estado que permita esa decisión.",
  verificationRequested: "Tu solicitud está en revisión.",
  verificationUnchanged: "Tu solicitud ya estaba registrada.",
} as const;
