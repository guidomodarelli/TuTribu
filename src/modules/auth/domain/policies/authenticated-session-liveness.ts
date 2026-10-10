/** Evaluates current session deadlines for private authorization without framework dependencies. @module authenticated-session-liveness */

/**
 * Rejects expired or unusable session/time facts before protected resource access.
 * @param expiresAt - Authoritative deadline of the current authenticated session.
 * @param now - Current clock sampled after any awaited identity/resource read.
 * @returns Whether both dates are usable and the session still has remaining lifetime.
 */
export function isAuthenticatedSessionLive(expiresAt: Date, now: Date): boolean {
  return Number.isFinite(now.getTime()) && Number.isFinite(expiresAt.getTime()) && expiresAt > now;
}
