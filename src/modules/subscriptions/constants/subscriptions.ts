/**
 * Provides canonical subscription statuses and constraints.
 *
 * @module subscriptions-constants
 */

/**
 * Defines the only currency supported by the first subscription flow.
 */
export const TRIBE_SUBSCRIPTION_CURRENCY = {
  ars: "ARS",
} as const;

/**
 * Defines recurring billing frequencies supported by tribe prices.
 */
export const TRIBE_SUBSCRIPTION_FREQUENCY = {
  monthly: "monthly",
} as const;

/**
 * Defines the maximum number of historical prices allowed per tribe.
 */
export const TRIBE_SUBSCRIPTION_PRICE_LIMIT = 30;

/**
 * Defines mutation and access statuses for tribe subscription prices.
 */
export const TRIBE_SUBSCRIPTION_PRICE_STATUS = {
  connected: "connected",
  created: "created",
  current: "current",
  deleted: "deleted",
  forbidden: "forbidden",
  hasSubscribers: "has_subscribers",
  invalidInput: "invalid_input",
  limitReached: "limit_reached",
  missingIntegration: "missing_integration",
  notFound: "not_found",
  setupRequired: "setup_required",
  subscriptionRequired: "subscription_required",
} as const;

/**
 * Defines local lifecycle statuses for member subscriptions.
 */
export const TRIBE_MEMBER_SUBSCRIPTION_STATUS = {
  active: "active",
  canceled: "canceled",
  conductBlocked: "conduct_blocked",
  duplicateWebhook: "duplicate_webhook",
  ended: "ended",
  gracePeriod: "grace_period",
  invalidInvitation: "invalid_invitation",
  missingCurrentPrice: "missing_current_price",
  paymentBlocked: "payment_blocked",
  pending: "pending",
  pastDue: "past_due",
  processed: "processed",
} as const;

/**
 * Defines why a blocked tribe membership should be treated as blocked.
 */
export const TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON = {
  conductBlocked: "conduct_blocked",
  none: "none",
  paymentBlocked: "payment_blocked",
} as const;
