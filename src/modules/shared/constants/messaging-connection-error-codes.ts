/**
 * Outcomes of using an academy's messaging connection, shared by the
 * messaging and academy admission error catalogues so both report the same
 * stable code for the same provider or connection failure.
 */
export const MESSAGING_CONNECTION_ERROR_CODE = {
  connectionIncomplete: "connection_incomplete",
  /** The academy has not saved its countries and daily quotas yet; distinct from an incomplete connection. */
  usagePolicyMissing: "usage_policy_missing",
  missingCapability: "missing_capability",
  invalidCredentials: "invalid_credentials",
  upstreamRejected: "upstream_rejected",
  providerRateLimited: "provider_rate_limited",
  transportTimeout: "transport_timeout",
  dependencyUnavailable: "dependency_unavailable",
  deliveryUnknown: "delivery_unknown",
  operationUnresolved: "operation_unresolved",
  upstreamPayloadUnusable: "upstream_payload_unusable",
  publicContractUnusable: "public_contract_unusable",
  unexpectedFailure: "unexpected_failure",
  /**
   * The deployment cannot protect the operation with its hosting messaging security (missing, unusable, not enrolled or
   * locked for recovery). A definitive rejection that registered nothing; only the TuTribu team can resolve it.
   */
  platformSecurityUnavailable: "platform_security_unavailable",
  /** Ordinary disconnection of the selected connection would leave admissions with verification or email notices without messaging; the leader resolves that dependency first. */
  connectionRetirementBlocked: "connection_retirement_blocked",
  /** The previous send of a notice may already have left and still has no confirmed result, so it cannot be recovered yet. */
  originalDispatchUnresolved: "original_dispatch_unresolved",
} as const;
