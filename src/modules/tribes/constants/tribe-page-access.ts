export const TRIBE_MEMBERSHIP_STATUS = {
  active: "active",
  blocked: "blocked",
  muted: "muted",
  removed: "removed",
} as const;

export const TRIBE_MEMBERSHIP_STATUS_REASON = {
  conductBlocked: "conduct_blocked",
  none: "none",
  paymentBlocked: "payment_blocked",
  subscriptionInactive: "subscription_inactive",
} as const;

export const TRIBE_PAGE_ACCESS_STATUS = {
  hidden: "hidden",
  visible: "visible",
} as const;

export const TRIBE_PAGE_ACCESS_REASON = {
  /**
   * Academy-mode basic member: the membership is valid, but the private
   * community content requires academy access (RF-09 allowlist).
   */
  academyAccessRequired: "academy_access_required",
  blockedHidden: "blocked_hidden",
  notFoundOrNotVisible: "not_found_or_not_visible",
  unauthenticatedHidden: "unauthenticated_hidden",
} as const;
