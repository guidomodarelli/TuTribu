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
 * Defines Mercado Pago free trial period units supported by subscription plans.
 */
export const TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE = {
  days: "days",
  months: "months",
} as const;

/**
 * Defines the availability of the tokenless public-join subscription offer.
 *
 * A tribe exposes its current paid price through the public tribe link only
 * when a paid plan is flagged as current; otherwise the offer is unavailable
 * and the public link does nothing.
 */
export const TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS = {
  available: "available",
  unavailable: "unavailable",
} as const;

/**
 * Defines the maximum number of active prices allowed per tribe.
 */
export const TRIBE_SUBSCRIPTION_PRICE_LIMIT = 30;

/**
 * Defines the minimum recurring price accepted by Mercado Pago for ARS plans.
 */
export const TRIBE_SUBSCRIPTION_PRICE_MINIMUM_AMOUNT_CENTS = 1500;

/**
 * Defines the minimum free trial length accepted for Mercado Pago day-based plans.
 */
export const TRIBE_SUBSCRIPTION_TRIAL_MINIMUM_DAYS = 1;

/**
 * Defines the maximum free trial length accepted for Mercado Pago day-based plans.
 */
export const TRIBE_SUBSCRIPTION_TRIAL_MAXIMUM_DAYS = 14;

/**
 * Defines Mercado Pago OAuth integration health states.
 */
export const MERCADO_PAGO_CONNECTION_STATUS = {
  connected: "connected",
  requiresReconnection: "requires_reconnection",
} as const;

/**
 * Defines the invitation actions allowed while deleting a subscription price.
 */
export const SUBSCRIPTION_PRICE_INVITATION_ACTION = {
  revoke: "revoke",
  switchToCurrent: "switch_to_current",
  switchToSpecific: "switch_to_specific",
} as const;

/**
 * Defines the supported triggers for provider subscriber reconciliation.
 */
export const TRIBE_PROVIDER_SUBSCRIBER_RECONCILIATION_SOURCE = {
  adminRepair: "admin_repair",
  manualButton: "manual_button",
  scheduledJob: "scheduled_job",
  webhook: "webhook",
} as const;

/**
 * Defines mutation and access statuses for tribe subscription prices.
 */
export const TRIBE_SUBSCRIPTION_PRICE_STATUS = {
  active: "active",
  connected: "connected",
  canceled: "canceled",
  created: "created",
  current: "current",
  deleted: "deleted",
  forbidden: "forbidden",
  hasLinkedInvitations: "has_linked_invitations",
  hasSubscribers: "has_subscribers",
  invalidInput: "invalid_input",
  limitReached: "limit_reached",
  missingIntegration: "missing_integration",
  notFound: "not_found",
  paused: "paused",
  setupRequired: "setup_required",
  subscriptionRequired: "subscription_required",
  updated: "updated",
  verified: "verified",
} as const;

/**
 * Defines local lifecycle statuses for member subscriptions.
 */
export const TRIBE_MEMBER_SUBSCRIPTION_STATUS = {
  active: "active",
  alreadySubscribed: "already_subscribed",
  canceled: "canceled",
  conductBlocked: "conduct_blocked",
  duplicateWebhook: "duplicate_webhook",
  ended: "ended",
  gracePeriod: "grace_period",
  invalidInvitation: "invalid_invitation",
  missingCurrentPrice: "missing_current_price",
  notFound: "not_found",
  paymentBlocked: "payment_blocked",
  paused: "paused",
  pending: "pending",
  pastDue: "past_due",
  providerUnavailable: "provider_unavailable",
  processed: "processed",
  removedBySubscription: "removed_by_subscription",
  retryableWebhook: "retryable_webhook",
} as const;

/**
 * Defines why a blocked tribe membership should be treated as blocked.
 */
export const TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON = {
  conductBlocked: "conduct_blocked",
  none: "none",
  paymentBlocked: "payment_blocked",
  subscriptionInactive: "subscription_inactive",
} as const;

/**
 * Product a price or a member subscription belongs to. `membership` is the
 * historical behavior (tribe entry); `academy` is the paid academy access.
 */
export type TribeSubscriptionProductKey = "academy" | "membership";

export const TRIBE_SUBSCRIPTION_PRODUCT_KEY = {
  academy: "academy",
  membership: "membership",
} as const satisfies Record<string, TribeSubscriptionProductKey>;

/** Renewal state of an academy subscription as confirmed locally. */
export type AcademySubscriptionRenewalStatus =
  | "active"
  | "canceled"
  | "canceling"
  | "none"
  | "pending";

export const ACADEMY_SUBSCRIPTION_RENEWAL_STATUS = {
  active: "active",
  canceled: "canceled",
  canceling: "canceling",
  none: "none",
  pending: "pending",
} as const satisfies Record<string, AcademySubscriptionRenewalStatus>;

/** Minimum time between two self-service coverage reconciliations. */
export const ACADEMY_COVERAGE_RECONCILIATION_THROTTLE_SECONDS = 60;

/** Monthly academy billing cycle policy. */
export const ACADEMY_BILLING_CYCLE = {
  /** Maximum drift between a scheduled debit date and its cycle start. */
  debitToleranceDays: 3,
  millisecondsPerDay: 86_400_000,
} as const;
