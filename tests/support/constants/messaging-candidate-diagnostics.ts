/** Names the historical SQL diagnostic scenarios without exporting generated codes or key material. @module messaging-candidate-diagnostic-test-constants */
/** Separates queued, completed local verification and externally unresolved histories. */
export const CANDIDATE_DIAGNOSTIC_SCENARIOS = ["queued", "verified", "accepted", "unknown"] as const;
/** Places the marker and optional local verification strictly inside the original challenge lifetime. */
export const CANDIDATE_DIAGNOSTIC_HISTORY = { markerDelayMs: 1_000, verificationDelayMs: 2_000, usagePolicyVersion: 3, senderId: "candidate-diagnostic-sender", environment: "synthetic-local", securityEpoch: "synthetic-epoch", seedOperation: "CandidateDiagnosticFixture.seed", unavailableCode: "unavailable" } as const;
