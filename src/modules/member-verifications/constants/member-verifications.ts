/**
 * Vocabulary and limits of member verifications (manual accreditation of a
 * relation with a provider configured by the tribe leader).
 *
 * @module member-verifications-constants
 */

export type MemberVerificationStatus = "pending" | "rejected" | "revoked" | "verified";

export const MEMBER_VERIFICATION_STATUS = {
  pending: "pending",
  rejected: "rejected",
  revoked: "revoked",
  verified: "verified",
} as const satisfies Record<string, MemberVerificationStatus>;

/** Reviewer decisions accepted by the review use case. */
export type MemberVerificationDecision = "rejected" | "revoked" | "verified";

export const MEMBER_VERIFICATION_DECISION = {
  rejected: "rejected",
  revoked: "revoked",
  verified: "verified",
} as const satisfies Record<string, MemberVerificationDecision>;

export const VERIFICATION_PROVIDER_LIMITS = {
  displayNameMaxLength: 80,
  instructionsMaxLength: 1000,
  keyMaxLength: 40,
  keyPattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  linkUrlMaxLength: 2048,
  maxProvidersPerTribe: 20,
} as const;

export const MEMBER_VERIFICATION_LIMITS = {
  declaredEmailMaxLength: 254,
  reasonMaxLength: 500,
  reasonMinLength: 3,
} as const;

export const VERIFICATION_REVIEW_QUEUE_PAGE = {
  defaultPageSize: 20,
  maxPageSize: 50,
  searchMaxLength: 80,
} as const;
