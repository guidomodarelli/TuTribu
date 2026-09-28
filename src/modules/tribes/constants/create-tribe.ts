export const CREATE_TRIBE_STATUS = {
  created: "created",
  invalidName: "invalid-name",
  invalidSlug: "invalid-slug",
  notAllowed: "not-allowed",
  slugConflict: "slug-conflict",
} as const;

export const CREATE_TRIBE_MEMBER_ROLE = {
  leader: "leader",
} as const;

export const CREATE_TRIBE_ERROR_CODE = {
  unauthenticated: "unauthenticated",
  unexpected: "unexpected",
} as const;

export const CREATE_TRIBE_ERROR_MESSAGE = {
  [CREATE_TRIBE_STATUS.invalidName]: "Define un nombre para tu tribu.",
  [CREATE_TRIBE_STATUS.invalidSlug]: "Define un slug valido para tu tribu.",
  [CREATE_TRIBE_STATUS.slugConflict]:
    "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
  [CREATE_TRIBE_STATUS.notAllowed]:
    "Tu cuenta no esta habilitada para crear tribus.",
  [CREATE_TRIBE_ERROR_CODE.unexpected]:
    "No pudimos crear tu tribu. Intentalo otra vez.",
} as const;
