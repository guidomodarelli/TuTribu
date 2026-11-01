/** Declares closed semantic failure codes independently of HTTP, public DTOs and runtime catalogues. @module messaging-error-code */
export type MessagingErrorCode=
  |"invalid_input"|"authentication_required"|"permission_denied"|"resource_unavailable"|"idempotency_conflict"
  |"usage_policy_conflict"|"connection_conflict"|"delivery_conflict"|"recipient_not_allowed"|"usage_limit_reached"
  |"credential_validation_limit_reached"|"verification_code_incorrect"|"challenge_expired"|"challenge_invalidated"|"challenge_already_sent"
  |"verification_attempts_exceeded"|"reauthentication_required"|"connection_incomplete"|"usage_policy_missing"|"missing_capability"
  |"invalid_credentials"|"upstream_rejected"|"provider_rate_limited"|"transport_timeout"|"dependency_unavailable"
  |"delivery_unknown"|"operation_unresolved"|"upstream_payload_unusable"|"public_contract_unusable"|"unexpected_failure"
  |"platform_security_unavailable"|"connection_retirement_blocked"|"original_dispatch_unresolved";
