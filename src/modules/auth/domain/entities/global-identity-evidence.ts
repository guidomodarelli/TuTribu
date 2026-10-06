/**
 * Models minimal, server-only identity capture without storing another JWT or token.
 *
 * @module global-identity-evidence
 */
export type GoogleIdentityEvidenceCandidate = {
  subject: string;
  normalizedEmail: string;
  emailVerifiedClaim: boolean;
  hostedDomain: string | null;
  classification: "gmail" | "workspace" | "insufficient";
  issuer: string;
  audience: string;
  tokenIssuedAt: Date;
  tokenExpiresAt: Date;
  authenticatedAt: Date | null;
  nonce: string | null;
};

/** Associates a verified capture with the account actually linked by global auth. */
export type GlobalIdentityEvidence = Omit<GoogleIdentityEvidenceCandidate, "nonce" | "authenticatedAt"> & {
  id: string;
  userId: string;
  accountId: string;
  providerId: "google";
  verifiedAt: Date;
  version: number;
  invalidatedAt: Date | null;
  invalidationReason: string | null;
};
