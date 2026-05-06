export const TRIBE_INVITATION_STATUS = {
  accepted: "accepted",
  active: "active",
  blocked: "blocked",
  created: "created",
  forbidden: "forbidden",
  invalid: "invalid",
  notFound: "not_found",
  revoked: "revoked",
  setupRequired: "setup_required",
} as const;

export const TRIBE_INVITATION_ROLE = {
  guardian: "guardian",
  leader: "leader",
  tribemate: "tribemate",
} as const;

export const TRIBE_INVITATION_MEMBERSHIP_STATUS = {
  active: "active",
  blocked: "blocked",
  muted: "muted",
} as const;
