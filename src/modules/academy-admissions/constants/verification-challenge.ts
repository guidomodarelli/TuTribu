/** Names local challenge transitions and denial outcomes, independent of delivery state. */
export const VERIFICATION_CHALLENGE_STATE = {
  issued: "issued", verified: "verified", invalidated: "invalidated", expired: "expired",
} as const;
export const VERIFICATION_CHALLENGE_REASON = {
  scopeMismatch: "verification_scope_mismatch",
  unavailable: "verification_challenge_unavailable",
  expired: "verification_challenge_expired",
  attemptsExhausted: "verification_attempts_exhausted",
  accountRateLimited: "verification_account_rate_limited",
  wrongCode: "verification_code_incorrect",
  proofUnavailable: "verification_proof_unavailable",
  proofExpired: "verification_proof_expired",
} as const;
export const VERIFICATION_TRANSITION_OUTCOME = {
  denied: "denied", wrongCode: "wrong_code", verified: "verified", applied: "applied",
} as const;
/** Distinguishes a confirmed failure replay from an unused or conflicting operation identity. */
export const VERIFICATION_FAILURE_REPLAY_STATE = { absent: "absent", recorded: "recorded", conflict: "conflict" } as const;
/** Bounds rejection sampling so decimal reduction does not bias generated codes. */
export const VERIFICATION_CODE_GENERATION = { decimalRange: 1_000_000, uint32Range: 4_294_967_296 } as const;
/** Scope fields that must come from current authoritative readers, never a browser marker. */
export const VERIFICATION_CHALLENGE_SCOPE_FIELDS = ["userId", "tribeId", "purpose", "verificationEpoch", "connectionId", "connectionVersion", "securityEpoch"] as const;
