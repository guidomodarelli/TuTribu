/**
 * Defines Google capture outcomes and the algorithm pinned for admission evidence.
 *
 * @module google-identity-evidence-constants
 */
export const GOOGLE_EVIDENCE_ALGORITHM = "RS256";
/** Names the existing global provider and its private evidence decorator. */
export const GOOGLE_IDENTITY_PROVIDER = "google";
export const GOOGLE_EVIDENCE_PLUGIN_ID = "google-identity-evidence";
export const GOOGLE_EVIDENCE_STATUS = { verified: "verified", insufficient: "insufficient" } as const;
export const GOOGLE_EMAIL_AUTHORITY = { gmail: "gmail", workspace: "workspace", insufficient: "insufficient" } as const;
export const GOOGLE_EVIDENCE_FAILURE = {
  malformedToken: "token_malformed",
  unsupportedAlgorithm: "token_algorithm_unsupported",
  notVerified: "token_not_verified",
  claimsUnavailable: "token_claims_unavailable",
} as const;
export const GOOGLE_GMAIL_SUFFIX = "@gmail.com";
/** Locates only the protected header before delegating full JWT verification. */
export const GOOGLE_JWT_HEADER_INDEX = 0;
/** Locates signed payload data only after the native verifier accepts the token. */
export const GOOGLE_JWT_PAYLOAD_INDEX = 1;
