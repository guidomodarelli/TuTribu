export const TRIBE_WELCOME_LINK_TYPE = {
  customButton: "custom_button",
  whatsappButton: "whatsapp_button",
} as const;

export const TRIBE_WELCOME_SAVE_STATUS = {
  forbidden: "forbidden",
  notFound: "not_found",
  updated: "updated",
} as const;

export const DEFAULT_TRIBE_WELCOME_MESSAGE = "Bienvenido/a a la tribu";

export const DEFAULT_TRIBE_WELCOME_SELECTION_MODAL_TITLE =
  "Elegí una opción para empezar";

export const DEFAULT_TRIBE_WELCOME_SELECTION_MODAL_DESCRIPTION =
  "Elegí una opción para empezar. Cualquiera te da acceso a los recursos del grupo. Podés cerrar y elegir más tarde.";

export const DEFAULT_TRIBE_WELCOME_LINKS_HEADING = "Recursos para empezar";

export const TRIBE_WELCOME_SELECTION_STATUS = {
  forbidden: "forbidden",
  invalidLink: "invalid_link",
  recorded: "recorded",
} as const;
