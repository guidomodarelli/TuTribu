/** Owns safe personal-preview states and Spanish copy without recipient or token material. @module personal-invitation-overview-constants */
export const PERSONAL_INVITATION_OVERVIEW_STATE = { signInRequired: "sign_in_required", unavailable: "unavailable", available: "available" } as const;
/** Fixed diagnostic operation never contains the raw token path or recipient. */
export const PERSONAL_INVITATION_PREVIEW_OPERATION = "personal-invitation-preview";
/** Unavailable and wrong-account views share the same message and contain no tribe/contact hints. */
export const PERSONAL_INVITATION_OVERVIEW_MESSAGE = {
  signIn: "Iniciá sesión para consultar esta invitación personal.",
  unavailable: "No podemos continuar con esta invitación desde esta cuenta. Podés cambiar de cuenta o usar otra vía de ingreso.",
  admitted: "Al confirmar, ingresarás gratis a esta academia.",
  pending: "Al confirmar, enviarás una solicitud que deberá revisar el equipo de la academia.",
  verification: "Comprobá tu contacto antes de confirmar esta invitación personal.",
} as const;
