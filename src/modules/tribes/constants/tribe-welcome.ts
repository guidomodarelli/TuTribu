export const TRIBE_WELCOME_LINK_TYPE = {
  customButton: "custom_button",
  whatsappButton: "whatsapp_button",
} as const;

export const TRIBE_WELCOME_SAVE_STATUS = {
  forbidden: "forbidden",
  notFound: "not_found",
  updated: "updated",
} as const;

export const DEFAULT_TRIBE_WELCOME_MESSAGE =
  "Nos alegra que te sumes. Antes de activar tu acceso, leé los acuerdos y elegí cómo querés empezar.";

export const DEFAULT_TRIBE_WELCOME_SELECTION_MODAL_TITLE =
  "Elegí cómo querés empezar";

export const DEFAULT_TRIBE_WELCOME_SELECTION_MODAL_DESCRIPTION =
  "Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde.";

export const DEFAULT_TRIBE_WELCOME_LINKS_HEADING = "Recursos para empezar";

export const TRIBE_WELCOME_SELECTION_STATUS = {
  forbidden: "forbidden",
  invalidLink: "invalid_link",
  recorded: "recorded",
} as const;
