export const TRIBE_MEMBERSHIP_STATUS = {
  active: "active",
  blocked: "blocked",
  muted: "muted",
} as const;

export const TRIBE_PAGE_ACCESS_STATUS = {
  hidden: "hidden",
  visible: "visible",
} as const;

export const TRIBE_PAGE_ACCESS_REASON = {
  blockedHidden: "blocked_hidden",
  notFoundOrNotVisible: "not_found_or_not_visible",
  unauthenticatedHidden: "unauthenticated_hidden",
} as const;
