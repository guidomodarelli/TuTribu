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

export const TRIBE_WELCOME_SELECTION_STATUS = {
  forbidden: "forbidden",
  invalidLink: "invalid_link",
  recorded: "recorded",
} as const;
