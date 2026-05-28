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
  subscriptionRequired: "subscription_required",
  updated: "updated",
} as const;

export const TRIBE_INVITATION_SUBSCRIPTION_OFFER_STATUS = {
  available: "available",
  unavailable: "unavailable",
} as const;

export const TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE = {
  current: "current",
  free: "free",
  specific: "specific",
} as const;

export const TRIBE_INVITATION_CHANNEL = {
  direct: "direct",
  instagram: "instagram",
  other: "other",
  tiktok: "tiktok",
  whatsapp: "whatsapp",
  youtube: "youtube",
} as const;

export const TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_ACTION = {
  switchToCurrent: "switch_to_current",
  switchToSpecific: "switch_to_specific",
  revoke: "revoke",
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
