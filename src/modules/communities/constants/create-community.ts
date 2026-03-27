export const CREATE_COMMUNITY_STATUS = {
  created: "created",
  invalidName: "invalid-name",
  invalidSlug: "invalid-slug",
  notAllowed: "not-allowed",
  slugConflict: "slug-conflict",
} as const;

export const CREATE_COMMUNITY_MEMBER_ROLE = {
  owner: "owner",
} as const;

export const CREATE_COMMUNITY_ERROR_CODE = {
  unexpected: "unexpected",
} as const;

export const CREATE_COMMUNITY_ERROR_MESSAGE = {
  [CREATE_COMMUNITY_STATUS.invalidName]: "Define un nombre para tu comunidad.",
  [CREATE_COMMUNITY_STATUS.invalidSlug]: "Define un slug valido para tu comunidad.",
  [CREATE_COMMUNITY_STATUS.slugConflict]:
    "Ese slug ya esta en uso. Puedes probar con la sugerencia.",
  [CREATE_COMMUNITY_STATUS.notAllowed]:
    "Tu cuenta no esta habilitada para crear comunidades.",
  [CREATE_COMMUNITY_ERROR_CODE.unexpected]:
    "No pudimos crear tu comunidad. Intentalo otra vez.",
} as const;
