/**
 * Safe Spanish messages returned by the academy and verification routes.
 *
 * @module academy-route-copy
 */

export const ACADEMY_ROUTE_COPY = {
  checkoutUnresolved: "Estamos verificando si Mercado Pago creó tu suscripción. Esperá unos instantes y volvé a intentar. Si el problema continúa, contactá al líder.",
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
