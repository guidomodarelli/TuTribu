/** Defines own safe intent outcomes and user-facing messages, independently of provider errors. */
export const REAUTHENTICATION_INTENT_OUTCOME={pending:"pending",verified:"verified",required:"reauthentication_required",expired:"expired"} as const;
export const REAUTHENTICATION_ERROR_CODE={notAuthenticated:"not_authenticated",required:"reauthentication_required",contextUnavailable:"context_unavailable",notFound:"intent_not_found",invalidInput:"invalid_input",unexpected:"unexpected_failure",unusableContract:"public_contract_unusable"} as const;
export const REAUTHENTICATION_ERROR_MESSAGE={
  [REAUTHENTICATION_ERROR_CODE.notAuthenticated]:"Iniciá sesión para continuar.",
  [REAUTHENTICATION_ERROR_CODE.required]:"Volvé a autenticarte con Google para confirmar esta acción.",
  [REAUTHENTICATION_ERROR_CODE.contextUnavailable]:"La cuenta o el recurso ya no permite esta operación.",
  [REAUTHENTICATION_ERROR_CODE.notFound]:"La solicitud de autenticación no está disponible.",
  [REAUTHENTICATION_ERROR_CODE.invalidInput]:"Revisá los datos de la operación.",
  [REAUTHENTICATION_ERROR_CODE.unexpected]:"No pudimos completar esta operación. Intentá nuevamente.",
  [REAUTHENTICATION_ERROR_CODE.unusableContract]:"No pudimos mostrar el resultado. Intentá nuevamente.",
} as const;
export const REAUTHENTICATION_INTENT_MESSAGE={pending:"Confirmá tu autenticación con Google para continuar.",verified:"Tu autenticación reciente está confirmada para esta acción.",required:"No pudimos acreditar una autenticación reciente. Volvé a intentarlo.",expired:"La solicitud de autenticación venció. Iniciá una nueva."} as const;
