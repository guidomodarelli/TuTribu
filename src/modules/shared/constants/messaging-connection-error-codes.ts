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
} as const;
