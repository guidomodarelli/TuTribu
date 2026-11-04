export const TRIBE_INVITATION_STATUS = {
  admissionRequired: "admission_required",
  /** An academy that has not activated admission control: its own academy home offers the basic entry. */
  academyJoinAvailable: "academy_join_available",
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
