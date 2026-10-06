/**
 * Derives minimal evidence only after the existing Google verifier accepts the same token.
 *
 * @module google-id-token-evidence-verifier
 */
import type { google } from "better-auth/social-providers";

import {
  GOOGLE_EMAIL_AUTHORITY, GOOGLE_EVIDENCE_ALGORITHM,
  GOOGLE_EVIDENCE_FAILURE, GOOGLE_EVIDENCE_STATUS,
  GOOGLE_GMAIL_SUFFIX, GOOGLE_JWT_HEADER_INDEX,
} from "@/src/modules/auth/constants/google-identity-evidence";
import { MILLISECONDS_PER_SECOND } from "@/src/constants/time";
import type { GoogleIdentityEvidenceCandidate } from "@/src/modules/auth/domain/entities/global-identity-evidence";

type NativeGoogleProvider = Pick<ReturnType<typeof google>, "verifyIdToken" | "getUserInfo">;
export type GoogleIdentityEvidenceVerificationResult =
  | { status: "verified"; evidence: GoogleIdentityEvidenceCandidate }
  | { status: "insufficient"; reason: (typeof GOOGLE_EVIDENCE_FAILURE)[keyof typeof GOOGLE_EVIDENCE_FAILURE] };

/**
 * Reads only the header algorithm before signature verification.
 *
 * @param token - Token already obtained through the global auth boundary.
 * @returns The algorithm label or null for an unusable protected header.
 */
function readProtectedAlgorithm(token: string): string | null {
  try {
    const headerSegment = token.split(".")[GOOGLE_JWT_HEADER_INDEX];
    const decoded = atob(headerSegment.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    const header: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof header === "object" && header !== null && !Array.isArray(header)
      && "alg" in header && typeof header.alg === "string" ? header.alg : null;
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof DOMException && error.name === "InvalidCharacterError")) return null;
    throw error;
  }
}

/**
 * Verifies RS256 via Better Auth and derives authority from its unchanged signed data.
 *
 * SDK false carries no invented JWKS/transport cause. A cryptographically valid
 * external or insufficient email remains a valid global login, without authority
 * for automatic contact matching. No profile boolean is used as a substitute.
 *
 * @param token - Exact ID token received by the global Google flow.
 * @param provider - Original native Google provider, not its evidence decorator.
 * @returns Minimal private capture or a stable insufficient-evidence outcome.
 * @throws A real unexpected decoder/provider failure for the owning auth boundary.
 */
export async function verifyGoogleIdTokenEvidence(
  token: string,
  provider: NativeGoogleProvider,
): Promise<GoogleIdentityEvidenceVerificationResult> {
  const insufficient = (reason: (typeof GOOGLE_EVIDENCE_FAILURE)[keyof typeof GOOGLE_EVIDENCE_FAILURE]): GoogleIdentityEvidenceVerificationResult => ({ status: GOOGLE_EVIDENCE_STATUS.insufficient, reason });
  const algorithm = readProtectedAlgorithm(token);
  if (!algorithm) return insufficient(GOOGLE_EVIDENCE_FAILURE.malformedToken);
  if (algorithm !== GOOGLE_EVIDENCE_ALGORITHM) return insufficient(GOOGLE_EVIDENCE_FAILURE.unsupportedAlgorithm);
  if (!await provider.verifyIdToken(token, undefined)) return insufficient(GOOGLE_EVIDENCE_FAILURE.notVerified);
  const userInfo = await provider.getUserInfo({ idToken: token });
  if (!userInfo) return insufficient(GOOGLE_EVIDENCE_FAILURE.claimsUnavailable);
  const claims = userInfo.data;
  // Narrow only the fields consumed for capture. The provider contract is not
  // revalidated with a schema, and unconsumed profile fields are never forwarded.
  if (typeof claims.sub !== "string" || !claims.sub || typeof claims.email !== "string" || !claims.email
    || typeof claims.iss !== "string" || typeof claims.aud !== "string"
    || typeof claims.iat !== "number" || typeof claims.exp !== "number") return insufficient(GOOGLE_EVIDENCE_FAILURE.claimsUnavailable);
  const normalizedEmail = claims.email.trim().toLowerCase();
  const hostedDomain = typeof claims.hd === "string" && claims.hd.trim() ? claims.hd.trim().toLowerCase() : null;
  const emailVerifiedClaim = claims.email_verified === true;
  let classification: GoogleIdentityEvidenceCandidate["classification"] = GOOGLE_EMAIL_AUTHORITY.insufficient;
  if (emailVerifiedClaim && normalizedEmail.endsWith(GOOGLE_GMAIL_SUFFIX)) classification = GOOGLE_EMAIL_AUTHORITY.gmail;
  else if (emailVerifiedClaim && hostedDomain) classification = GOOGLE_EMAIL_AUTHORITY.workspace;
  const temporalClaims = claims as typeof claims & { auth_time?: unknown; nonce?: unknown };
  return {
    status: GOOGLE_EVIDENCE_STATUS.verified,
    evidence: {
      subject: claims.sub, normalizedEmail, emailVerifiedClaim, hostedDomain, classification,
      issuer: claims.iss, audience: claims.aud,
      tokenIssuedAt: new Date(claims.iat * MILLISECONDS_PER_SECOND),
      tokenExpiresAt: new Date(claims.exp * MILLISECONDS_PER_SECOND),
      authenticatedAt: typeof temporalClaims.auth_time === "number" ? new Date(temporalClaims.auth_time * MILLISECONDS_PER_SECOND) : null,
      nonce: typeof temporalClaims.nonce === "string" ? temporalClaims.nonce : null,
    },
  };
}
