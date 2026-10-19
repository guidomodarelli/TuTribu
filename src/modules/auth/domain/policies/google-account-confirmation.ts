/** Determines freshness of an already verified, nonce-bound Google OAuth response. */
import { MILLISECONDS_PER_SECOND } from "@/src/constants/time";
import { RECENT_AUTHENTICATION_WINDOW_MS } from "@/src/modules/auth/constants/recent-authentication";

/**
 * Establishes the application's confirmation time without interpreting Google's login age.
 * @param input - Trusted token dates, current intent creation and the final server clock.
 * @returns A detached server confirmation time, or null for an ineligible response.
 * @remarks The caller must verify signature, nonce, exact scope and live authority first.
 * Token timestamps have second precision; intent creation uses the database clock.
 */
export function getGoogleAccountConfirmationTime(input: {
  now: Date;
  intentCreatedAt: Date;
  tokenIssuedAt: Date;
  tokenExpiresAt: Date;
}): Date | null {
  const now = input.now.getTime();
  const createdAt = input.intentCreatedAt.getTime();
  const issuedAt = input.tokenIssuedAt.getTime();
  const expiresAt = input.tokenExpiresAt.getTime();
  if (![now, createdAt, issuedAt, expiresAt].every(Number.isFinite)) return null;
  const creationSecond = Math.floor(createdAt / MILLISECONDS_PER_SECOND) * MILLISECONDS_PER_SECOND;
  if (createdAt > now || issuedAt < creationSecond || issuedAt > now || now - issuedAt >= RECENT_AUTHENTICATION_WINDOW_MS || expiresAt <= now) return null;
  return new Date(now);
}
