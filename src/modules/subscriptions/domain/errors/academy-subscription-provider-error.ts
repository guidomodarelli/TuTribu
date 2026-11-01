/**
 * Typed failure of an academy subscription operation that depends on the
 * payment provider or on the seller integration of the tribe. It travels as
 * the private `cause` of a repository result so routes can log which layer
 * failed and why, without exposing provider payloads.
 *
 * @module academy-subscription-provider-error
 */

/** Closed reason of a provider-dependent academy subscription failure. */
export type AcademySubscriptionProviderFailureCode =
  | "integration_unavailable"
  | "outcome_unconfirmed"
  | "provider_rejected"
  | "provider_unavailable";

export const ACADEMY_SUBSCRIPTION_PROVIDER_FAILURE_CODE = {
  /** The seller integration has no usable token or the application credentials are missing. */
  integrationUnavailable: "integration_unavailable",
  /** The provider may have applied the request, but its answer was lost. */
  outcomeUnconfirmed: "outcome_unconfirmed",
  /** The provider definitively rejected the request. */
  providerRejected: "provider_rejected",
  /** A transient provider failure (5xx, 429, network or timeout). */
  providerUnavailable: "provider_unavailable",
} as const satisfies Record<string, AcademySubscriptionProviderFailureCode>;

/** Academy subscription operation that called the provider. */
export type AcademySubscriptionProviderOperation =
  | "cancel_renewal"
  | "reconcile_coverage"
  | "start_checkout";

export const ACADEMY_SUBSCRIPTION_PROVIDER_OPERATION = {
  cancelRenewal: "cancel_renewal",
  reconcileCoverage: "reconcile_coverage",
  startCheckout: "start_checkout",
} as const satisfies Record<string, AcademySubscriptionProviderOperation>;

/** Carries the real provider or integration error as `cause` under a closed code. */
export class AcademySubscriptionProviderError extends Error {
  /**
   * @param code - Closed failure reason.
   * @param operation - Academy subscription operation that failed.
   * @param options - Real cause (gateway, token refresh or configuration error), when there is one.
   */
  constructor(
    readonly code: AcademySubscriptionProviderFailureCode,
    readonly operation: AcademySubscriptionProviderOperation,
    options?: ErrorOptions
  ) {
    super(`AcademySubscription:${operation} failed: ${code}`, options);
    this.name = "AcademySubscriptionProviderError";
  }
}
