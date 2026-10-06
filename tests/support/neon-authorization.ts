/**
 * Resolves validation authorization through the CLI's own safe renewal boundary.
 *
 * @module neon-validation-authorization
 */

/** Matches the CLI's stored expiry unit: milliseconds since the Unix epoch. */
export type NeonCliValidationCredentials = {
  access_token?: string;
  expires_at?: number;
  refresh_token?: string;
};

/** Leaves enough lifetime for branch setup, metadata checks, and cleanup. */
export const NEON_AUTHORIZATION_EXPIRY_MARGIN_MS = 60_000;
const NEON_AUTHORIZATION_ERROR = "AcademyAdmissionDatabase.authenticate failed: neon_authentication_required";
const NEON_AUTHORIZATION_EXPIRING_ERROR = "AcademyAdmissionDatabase.authenticate failed: neon_authorization_expiring";

/**
 * Resolves an existing CLI session using its official manager when expiry is near.
 *
 * The callback delegates rotating-token storage and cross-process locking to
 * the CLI. This helper never performs a manual refresh grant or logs a token.
 *
 * @param credentials - Existing local CLI credentials read by the harness.
 * @param renewSession - Official CLI renewal followed by a private credential read.
 * @returns An access token valid for this validation run.
 * @throws A safe authentication error or the real CLI/credential-read failure.
 */
export async function resolveNeonAuthorization(
  credentials: NeonCliValidationCredentials,
  renewSession: () => Promise<NeonCliValidationCredentials>,
): Promise<string> {
  if (typeof credentials.access_token !== "string" || !credentials.access_token || typeof credentials.expires_at !== "number" || !Number.isFinite(credentials.expires_at)) throw new Error(NEON_AUTHORIZATION_ERROR);
  if (credentials.expires_at > Date.now() + NEON_AUTHORIZATION_EXPIRY_MARGIN_MS) {
    return credentials.access_token;
  }
  const renewed = await renewSession();
  if (typeof renewed.access_token !== "string" || !renewed.access_token || typeof renewed.expires_at !== "number" || !Number.isFinite(renewed.expires_at)) throw new Error(NEON_AUTHORIZATION_ERROR);
  if (renewed.expires_at <= Date.now() + NEON_AUTHORIZATION_EXPIRY_MARGIN_MS) throw new Error(NEON_AUTHORIZATION_EXPIRING_ERROR);
  return renewed.access_token;
}
