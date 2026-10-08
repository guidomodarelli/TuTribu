/** Owns transfer operation identity, safe error codes and the former leader's explicit permitted role choices. @module tribe-leadership-constants */
export const TRIBE_LEADERSHIP_OPERATION="transfer_tribe_leadership";
/** Transfer does not create membership or alter product access; the caller explicitly chooses the former leader's remaining role. */
export const TRIBE_FORMER_LEADER_ROLE=["guardian","tribemate"] as const;
/** Closed semantic failures contain neither SQL diagnostics nor native session/account data. */
export const TRIBE_LEADERSHIP_ERROR_CODE={authenticationRequired:"authentication_required",permissionDenied:"permission_denied",invalidInput:"invalid_input",leadershipConflict:"leadership_conflict",resourceUnavailable:"resource_unavailable",idempotencyConflict:"idempotency_conflict",operationUnresolved:"operation_unresolved",publicContractUnusable:"public_contract_unusable",unexpectedFailure:"unexpected_failure"} as const;
